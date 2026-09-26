import {
  canonicalKey,
  normalizeSymptom,
} from '../inference/canonicalize';
import { isContextToken } from '../inference/context';

import type {
  Rule,
  RulesMetadata,
  RulesOutput,
  SymptomFrequency,
} from '../types/rules';


/* ============================================================
 * API
 * ============================================================
 */

export const API_URL =
  import.meta.env.VITE_RULES_API_URL;


export class ConfigurationError extends Error {}


/* ============================================================
 * BASIC VALIDATION HELPERS
 * ============================================================
 */

function object(
  value: unknown,
  path: string,
): Record<string, unknown> {

  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error(
      `Malformed dataset: ${path} must be an object.`,
    );
  }

  return value as Record<string, unknown>;
}


/**
 * Accept:
 *
 *     20
 *     0.5
 *
 * Also tolerate numeric strings coming from APIs:
 *
 *     "20"
 *     "0.5"
 *
 * Reject:
 *
 *     null
 *     ""
 *     "hello"
 *     NaN
 *     Infinity
 *     negatives
 */
function number(
  value: unknown,
  path: string,
  integer = false,
  max = Infinity,
): number {

  let parsed: number;


  if (typeof value === 'number') {

    parsed = value;

  } else if (
    typeof value === 'string' &&
    value.trim() !== ''
  ) {

    parsed = Number(value);

  } else {

    throw new Error(
      `Malformed dataset: invalid ${path}.`,
    );

  }


  if (
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    parsed > max ||
    (
      integer &&
      !Number.isInteger(parsed)
    )
  ) {

    throw new Error(
      `Malformed dataset: invalid ${path}.`,
    );

  }


  return parsed;
}


/* ============================================================
 * OPTIONAL NUMBER
 * ============================================================
 *
 * Metadata such as top_k_per_antecedent should NOT cause the
 * entire medical rule dataset to become unusable.
 *
 * undefined / null simply means:
 *
 *     "metadata not supplied"
 *
 * ============================================================
 */

function optionalNumber(
  value: unknown,
  path: string,
  integer = false,
  max = Infinity,
): number | undefined {

  if (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    return undefined;
  }


  return number(
    value,
    path,
    integer,
    max,
  );
}


/* ============================================================
 * SYMPTOM NAME VALIDATION
 * ============================================================
 */

function name(
  value: unknown,
  path: string,
): string {

  if (typeof value !== 'string') {

    throw new Error(
      `Malformed dataset: invalid symptom at ${path}.`,
    );

  }


  const normalized =
    normalizeSymptom(value);


  if (
    !normalized ||
    value.includes('|')
  ) {

    throw new Error(
      `Malformed dataset: invalid symptom at ${path}.`,
    );

  }


  return normalized;
}


/* ============================================================
 * API GATEWAY RESPONSE UNWRAPPER
 * ============================================================
 *
 * Supports:
 *
 * DIRECT:
 *
 * {
 *   metadata: {...},
 *   symptom_frequency: {...},
 *   rules: {...}
 * }
 *
 *
 * API GATEWAY:
 *
 * {
 *   statusCode: 200,
 *   body: "{ ...dataset... }"
 * }
 *
 *
 * API GATEWAY WITH OBJECT BODY:
 *
 * {
 *   statusCode: 200,
 *   body: { ...dataset... }
 * }
 *
 * ============================================================
 */

function unwrapPayload(
  input: unknown,
): unknown {

  const root = object(
    input,
    'root',
  );


  /* ----------------------------------------------------------
   * Already the actual RulesOutput
   * ----------------------------------------------------------
   */

  if (
    root.metadata !== undefined &&
    root.symptom_frequency !== undefined &&
    root.rules !== undefined
  ) {

    return root;

  }


  /* ----------------------------------------------------------
   * API Gateway wrapper
   * ----------------------------------------------------------
   */

  if ('body' in root) {

    const body =
      root.body;


    /* body already parsed */

    if (
      body &&
      typeof body === 'object' &&
      !Array.isArray(body)
    ) {

      return body;

    }


    /* body is JSON string */

    if (typeof body === 'string') {

      try {

        return JSON.parse(
          body,
        );

      } catch {

        throw new Error(
          'The rules service returned an invalid JSON body.',
        );

      }

    }

  }


  /*
   * If it wasn't wrapped, allow parseRulesOutput()
   * to produce the proper schema error.
   */

  return root;
}


/* ============================================================
 * PARSE RULES OUTPUT
 * ============================================================
 */

export function parseRulesOutput(
  input: unknown,
): RulesOutput {

  /* ----------------------------------------------------------
   * Remove possible API Gateway wrapper
   * ----------------------------------------------------------
   */

  const unwrapped =
    unwrapPayload(input);


  const data = object(
    unwrapped,
    'root',
  );


  /* ==========================================================
   * METADATA
   * ==========================================================
   */

  const meta = object(
    data.metadata,
    'metadata',
  );


  const config = object(
    meta.configuration,
    'configuration',
  );


  /* ----------------------------------------------------------
   * Required metadata
   * ----------------------------------------------------------
   */

  const transactions = number(
    meta.transactions,
    'transactions',
    true,
  );


  const uniqueSymptoms = number(
    meta.unique_symptoms,
    'unique_symptoms',
    true,
  );


  const antecedentKeys = number(
    meta.antecedent_keys,
    'antecedent_keys',
    true,
  );


  const rulesSaved = number(
    meta.rules_saved,
    'rules_saved',
    true,
  );


  const maxAntecedentSize = number(
    config.max_antecedent_size,
    'max_antecedent_size',
    true,
  );

  const maxContextFeatures = optionalNumber(config.max_context_features, 'max_context_features', true);


  if (
    transactions <= 0 ||
    maxAntecedentSize <= 0
  ) {

    throw new Error(
      'Malformed dataset: transaction count and maximum antecedent size must be positive.',
    );

  }


  const metadata: RulesMetadata = {

    transactions,

    unique_symptoms:
      uniqueSymptoms,

    antecedent_keys:
      antecedentKeys,

    rules_saved:
      rulesSaved,

    configuration: {

      max_antecedent_size:
        maxAntecedentSize,

      ...(maxContextFeatures === undefined ? {} : { max_context_features: maxContextFeatures }),

    },

  };


  /* ==========================================================
   * OPTIONAL SOURCE METADATA
   * ==========================================================
   */

  for (
    const key of [
      'source_bucket',
      'source_file',
    ] as const
  ) {

    if (
      meta[key] !== undefined &&
      meta[key] !== null
    ) {

      if (
        typeof meta[key] !== 'string'
      ) {

        throw new Error(
          `Malformed dataset: invalid ${key}.`,
        );

      }


      metadata[key] =
        meta[key];

    }

  }


  /* ==========================================================
   * OPTIONAL INTEGER METADATA
   * ==========================================================
   */

  if (
    meta.rules_generated !== undefined
  ) {

    metadata.rules_generated =
      number(
        meta.rules_generated,
        'rules_generated',
        true,
      );

  }


  if (
    meta.minimum_occurrence_count !== undefined
  ) {

    metadata.minimum_occurrence_count =
      number(
        meta.minimum_occurrence_count,
        'minimum_occurrence_count',
        true,
      );

  }


  /* ==========================================================
   * OPTIONAL CONFIGURATION
   *
   * These describe the dataset / UI defaults.
   *
   * They are NOT required for the N² dataset itself.
   * ==========================================================
   */


  const minSupport =
    optionalNumber(
      config.min_support,
      'min_support',
      false,
      1,
    );


  if (minSupport !== undefined) {

    metadata.configuration.min_support =
      minSupport;

  }


  const minConfidence =
    optionalNumber(
      config.min_confidence,
      'min_confidence',
      false,
      1,
    );


  if (
    minConfidence !== undefined
  ) {

    metadata.configuration.min_confidence =
      minConfidence;

  }


  const minLift =
    optionalNumber(
      config.min_lift,
      'min_lift',
    );


  if (minLift !== undefined) {

    metadata.configuration.min_lift =
      minLift;

  }


  const minOccurrences =
    optionalNumber(
      config.min_occurrences,
      'min_occurrences',
      true,
    );


  if (
    minOccurrences !== undefined
  ) {

    metadata.configuration.min_occurrences =
      minOccurrences;

  }


  /*
   * ==========================================================
   * IMPORTANT CHANGE
   * ==========================================================
   *
   * top_k_per_antecedent is now OPTIONAL metadata.
   *
   * Your Lambda no longer actually applies Top-K filtering.
   *
   * So:
   *
   *     20
   *     "20"
   *
   * are accepted.
   *
   * null / undefined are simply ignored.
   *
   * It should NEVER prevent the N² rule set from loading.
   * ==========================================================
   */

  const topK =
    optionalNumber(
      config.top_k_per_antecedent,
      'top_k_per_antecedent',
      true,
    );


  if (topK !== undefined) {

    metadata.configuration.top_k_per_antecedent =
      topK;

  }


  /* ==========================================================
   * SYMPTOM FREQUENCY
   * ==========================================================
   */

  const frequency:

    Record<
      string,
      SymptomFrequency
    > = Object.create(null);


  const rawFrequency = object(
    data.symptom_frequency,
    'symptom_frequency',
  );


  for (
    const [raw, value]
    of Object.entries(
      rawFrequency,
    )
  ) {

    const symptom = name(
      raw,
      'symptom_frequency',
    );

    if (isContextToken(symptom)) {
      throw new Error('Malformed dataset: context tokens must not appear in symptom_frequency.');
    }


    if (
      Object.hasOwn(
        frequency,
        symptom,
      )
    ) {

      throw new Error(
        `Malformed dataset: duplicate normalized symptom ${symptom}.`,
      );

    }


    const item = object(
      value,
      symptom,
    );


    frequency[symptom] = {

      count: number(
        item.count,
        'symptom count',
        true,
      ),

      probability: number(
        item.probability,
        'symptom probability',
        false,
        1,
      ),

    };

  }


  if (
    !Object.keys(
      frequency,
    ).length
  ) {

    throw new Error(
      'The dataset contains no symptoms.',
    );

  }


  const contextFrequency: Record<string, SymptomFrequency> = Object.create(null);
  if (data.context_frequency !== undefined) {
    for (const [raw, value] of Object.entries(object(data.context_frequency, 'context_frequency'))) {
      const context = name(raw, 'context_frequency');
      if (!isContextToken(context) || !context.slice(context.indexOf(':') + 1).trim()) {
        throw new Error(`Malformed dataset: invalid context token ${context}.`);
      }
      if (Object.hasOwn(contextFrequency, context)) throw new Error(`Malformed dataset: duplicate normalized context ${context}.`);
      const entry = object(value, context);
      contextFrequency[context] = {
        count: number(entry.count, 'context count', true, transactions),
        probability: number(entry.probability, 'context probability', false, 1),
      };
    }
  }

  /* ==========================================================
   * RULES
   * ==========================================================
   */

  const rules:

    Record<
      string,
      Rule[]
    > = Object.create(null);


  const rawRules = object(
    data.rules,
    'rules',
  );


  for (
    const [raw, value]
    of Object.entries(
      rawRules,
    )
  ) {

    /* --------------------------------------------------------
     * Antecedent
     *
     * Current N² generator produces:
     *
     *     fever
     *
     * But this still supports older:
     *
     *     fatigue|fever
     *
     * --------------------------------------------------------
     */

    const parts = raw
      .split('|')
      .map(
        part =>
          name(
            part,
            'antecedent',
          ),
      );


    const key =
      canonicalKey(parts);


    /* --------------------------------------------------------
     * Respect declared maximum antecedent size
     * --------------------------------------------------------
     */

    const tokens = key.split('|');
    if (tokens.filter(token => !isContextToken(token)).length > maxAntecedentSize) {

      throw new Error(
        'Malformed dataset: a rule exceeds the maximum antecedent size.',
      );

    }

    if (tokens.filter(isContextToken).length > (maxContextFeatures ?? Object.keys(contextFrequency).length)) {
      throw new Error('Malformed dataset: a rule exceeds max_context_features.');
    }


    /* --------------------------------------------------------
     * Antecedent contexts and symptoms have separate catalogs.
     * --------------------------------------------------------
     */

    for (const part of parts) {
      if (isContextToken(part)) {
        if (!Object.hasOwn(contextFrequency, part)) throw new Error(`Malformed dataset: unknown context token ${part} in rule antecedent.`);
      } else if (!Object.hasOwn(frequency, part)) {
        throw new Error('Malformed dataset: a rule antecedent is missing from the symptom catalog.');
      }
    }


    if (
      !Array.isArray(
        value,
      )
    ) {

      throw new Error(
        `Malformed dataset: rules for ${key} must be an array.`,
      );

    }


    /* ========================================================
     * PARSE EACH RULE
     * ========================================================
     */

    const entries =
      value.map(
        (
          item: unknown,
        ): Rule => {

          const rule = object(
            item,
            'rule',
          );


          const consequent = name(
            rule.then,
            'rule.then',
          );


          if (
            isContextToken(consequent) ||
            !Object.hasOwn(
              frequency,
              consequent,
            )
          ) {

            throw new Error(
              `Malformed dataset: ${consequent} is missing from the symptom catalog.`,
            );

          }


          const confidence =
            number(
              rule.confidence,
              'confidence',
              false,
              1,
            );


          const support =
            number(
              rule.support,
              'support',
              false,
              1,
            );


          const lift =
            number(
              rule.lift,
              'lift',
            );


          const occurrences =
            number(
              rule.occurrences,
              'occurrences',
              true,
            );


          const antecedentOccurrences =
            number(
              rule.antecedent_occurrences,
              'antecedent_occurrences',
              true,
            );


          const consequentOccurrences =
            number(
              rule.consequent_occurrences,
              'consequent_occurrences',
              true,
            );


          return {

            then:
              consequent,

            confidence,

            support,

            lift,

            occurrences,

            antecedent_occurrences:
              antecedentOccurrences,

            consequent_occurrences:
              consequentOccurrences,

          };

        },
      );


    /* --------------------------------------------------------
     * Merge canonical duplicate antecedent keys
     * --------------------------------------------------------
     */

    rules[key] = [

      ...(
        rules[key]
        ?? []
      ),

      ...entries,

    ];

  }


  /* ==========================================================
   * OPTIONAL CONSISTENCY WARNINGS
   *
   * Don't reject the dataset over metadata mismatch.
   *
   * N² data can be large and metadata should not stop loading.
   * ==========================================================
   */

  const actualSymptomCount =
    Object.keys(
      frequency,
    ).length;


  if (
    metadata.unique_symptoms
    !== actualSymptomCount
  ) {

    console.warn(

      '[rulesApi] unique_symptoms metadata mismatch:',

      {
        metadata:
          metadata.unique_symptoms,

        actual:
          actualSymptomCount,
      },

    );

  }


  const actualAntecedentKeys =
    Object.keys(
      rules,
    ).length;


  if (
    metadata.antecedent_keys
    !== actualAntecedentKeys
  ) {

    console.warn(

      '[rulesApi] antecedent_keys metadata mismatch:',

      {
        metadata:
          metadata.antecedent_keys,

        actual:
          actualAntecedentKeys,
      },

    );

  }


  return {

    metadata,

    symptom_frequency:
      frequency,

    ...(data.context_frequency === undefined ? {} : { context_frequency: contextFrequency }),

    rules,

  };

}


/* ============================================================
 * REQUEST CACHE
 * ============================================================
 */

let cachedRequest:
  Promise<RulesOutput>
  | undefined;


let failed = false;
let requestPending = false;


/* ============================================================
 * FETCH RULES
 * ============================================================
 */

/**
 * One shared request per page load.
 *
 * This also prevents React StrictMode's development remount
 * from downloading the huge N² dataset twice.
 */
export function fetchRules():
  Promise<RulesOutput> {


  if (cachedRequest) {

    return cachedRequest;

  }


  requestPending = true;
  cachedRequest =
    (async () => {


      /* ======================================================
       * ENV CONFIG
       * ======================================================
       */

      if (
        !API_URL?.trim()
      ) {

        throw new ConfigurationError(
          'The rules API has not been configured.',
        );

      }


      let url: URL;


      try {

        url = new URL(
          API_URL,
          window.location.origin,
        );

      } catch {

        throw new ConfigurationError(
          'The rules API URL is invalid.',
        );

      }


      if (
        ![
          'https:',
          'http:',
        ].includes(
          url.protocol,
        )
      ) {

        throw new ConfigurationError(
          'The rules API URL must use HTTP or HTTPS.',
        );

      }


      /* ======================================================
       * FETCH
       * ======================================================
       */

      const response =
        await fetch(
          url.href,
          {

            method:
              'GET',

            credentials:
              'omit',

            cache: 'no-store',

            headers: {

              Accept:
                'application/json',

            },

            signal:
              AbortSignal.timeout(
                30000,
              ),

          },
        );


      /* ======================================================
       * HTTP ERROR
       * ======================================================
       */

      if (
        !response.ok
      ) {

        throw new Error(

          `The rules service returned HTTP ${response.status}. Please retry.`,

        );

      }


      /* ======================================================
       * JSON
       * ======================================================
       */

      let data: unknown;


      try {

        data =
          await response.json();

      } catch {

        throw new Error(
          'The rules service did not return valid JSON.',
        );

      }


      /* ======================================================
       * DEBUG INFO
       *
       * Really useful until deployment is stable.
       * ======================================================
       */

      if (
        import.meta.env.DEV
      ) {

        console.log(
          '[rulesApi] Raw API response:',
          data,
        );

      }


      /* ======================================================
       * VALIDATE + NORMALIZE
       * ======================================================
       */

      const parsed =
        parseRulesOutput(
          data,
        );


      if (
        import.meta.env.DEV
      ) {

        console.log(
          '[rulesApi] Dataset loaded:',
          {

            transactions:
              parsed
                .metadata
                .transactions,

            uniqueSymptoms:
              parsed
                .metadata
                .unique_symptoms,

            antecedentKeys:
              parsed
                .metadata
                .antecedent_keys,

            rulesSaved:
              parsed
                .metadata
                .rules_saved,

            topK:
              parsed
                .metadata
                .configuration
                .top_k_per_antecedent,

          },
        );

      }


      return parsed;

    })()


      /* ======================================================
       * ERROR HANDLING
       * ======================================================
       */

      .catch(
        (
          error: unknown,
        ) => {


          failed = true;


          /* --------------------------------------------------
           * Browser/network/CORS error
           * --------------------------------------------------
           */

          if (
            error instanceof TypeError
          ) {

            throw new Error(

              'Unable to reach the rules service. Check your connection and the API CORS configuration, then retry.',

            );

          }


          /* --------------------------------------------------
           * AbortSignal.timeout()
           * --------------------------------------------------
           */

          if (
            error instanceof DOMException &&
            (
              error.name ===
                'TimeoutError'
              ||
              error.name ===
                'AbortError'
            )
          ) {

            throw new Error(

              'The rules service took too long to respond. Please retry.',

            );

          }


          throw error;

        },
      ).finally(() => { requestPending = false; });


  return cachedRequest;

}


/* ============================================================
 * RETRY
 * ============================================================
 */

/**
 * An explicit retry resets the previous failed request.
 */
export function retryRules():
  Promise<RulesOutput> {


  if (failed) {

    cachedRequest =
      undefined;

    failed =
      false;

  }


  return fetchRules();

}

/** Explicit user action: replace the page cache, but coalesce concurrent reload clicks. */
export function reloadRules(): Promise<RulesOutput> {
  if (requestPending && cachedRequest) return cachedRequest;
  cachedRequest = undefined;
  failed = false;
  return fetchRules();
}


/* ============================================================
 * RULE SOURCE INTERFACE
 * ============================================================
 */

export interface RuleSource {

  hasContext(token: string): boolean;

  getMetadata():
    RulesMetadata;


  hasSymptom(
    symptom: string,
  ): boolean;


  getRules(
    keys: readonly string[],
    signal?: AbortSignal,
  ): Promise<
    ReadonlyMap<
      string,
      readonly Rule[]
    >
  >;

}


/* ============================================================
 * IN-MEMORY RULE SOURCE
 * ============================================================
 */

export class InMemoryRuleSource
implements RuleSource {


  constructor(
    private readonly data:
      RulesOutput,
  ) {}

  hasContext(token: string): boolean {
    return isContextToken(token) && Object.hasOwn(this.data.context_frequency ?? {}, normalizeSymptom(token));
  }


  getMetadata():
    RulesMetadata {

    return this.data.metadata;

  }


  hasSymptom(
    symptom: string,
  ): boolean {

    const normalized =
      normalizeSymptom(
        symptom,
      );


    if (!normalized || isContextToken(normalized)) {

      return false;

    }


    return Object.hasOwn(

      this.data
        .symptom_frequency,

      normalized,

    );

  }


  async getRules(
    keys: readonly string[],
    signal?: AbortSignal,
  ): Promise<
    ReadonlyMap<
      string,
      readonly Rule[]
    >
  > {


    signal?.throwIfAborted();


    return new Map(

      keys.map(
        raw => {


          const key =
            canonicalKey(
              raw.split('|'),
            );


          const values =

            Object.hasOwn(
              this.data.rules,
              key,
            )

              ? this.data.rules[
                  key
                ]

              : [];


          return [
            key,
            values,
          ] as const;

        },
      ),

    );

  }

}
