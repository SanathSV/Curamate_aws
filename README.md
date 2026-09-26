# CuraMate — Latent Symptom Intelligence

A static React application for exploring association-derived latent symptom candidates and their evidence paths. It is a research/decision-support visualization, not a diagnosis system.

## Run locally

Requires Node.js 22.12+ (use a supported LTS release) and npm.

1. Run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Set the public API Gateway endpoint:

   ```dotenv
   VITE_RULES_API_URL=https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com/YOUR_ROUTE
   ```

4. Run `npm run dev` and open the URL printed by Vite.
5. Run `npm test` for the algorithm/data-layer tests.
6. Run `npm run build` to type-check the project and produce `dist/`.
7. Run `npm run preview` to serve that production build locally.

The API URL is a public, build-time Vite setting. Restart development or rebuild production after changing it. Do not place AWS keys, API secrets, or other credentials in any `VITE_*` variable.

Without an endpoint, the application renders a configuration state. It does not contain a rules dataset, silently use mock rules, or create a backend. The small synthetic fixtures under `src/test/` are used only by unit tests and are not included in the production bundle.

## Data flow

```text
Browser → GET VITE_RULES_API_URL → existing API Gateway / Lambda
                                      ↓
                            s3://symptomsrules/Rules_output.json

Response → validation / canonicalization → memory
                                         ├─ one Trie for symptom search
                                         └─ one Web Worker for local inference
```

`fetchRules(): Promise<RulesOutput>` in `src/api/rulesApi.ts` shares a module-level promise. Concurrent callers, completed callers, and React StrictMode remounts reuse that promise. Selecting symptoms, changing settings, and running inference never trigger a new dataset request. A rejected request remains cached until the user explicitly retries. Requests time out after 30 seconds. A page refresh starts a new session.

The worker receives the validated dataset once when initialized; subsequent messages contain only observations and inference settings. Rules remain in memory for the page session. Symptoms and exploration results are not persisted or sent to the backend.

The API must return the actual JSON object with `metadata`, `symptom_frequency`, and `rules`, not a Lambda proxy envelope such as `{ statusCode, body }` exposed to the browser. Strict interfaces are in `src/types/rules.ts`. Both the reduced metadata in the updated brief and the optional richer metadata are supported.

Validation checks structure, finite numeric metrics, probability/confidence/support bounds, integer counts, normalized names, antecedent size, and catalog membership. Every symptom used by a rule must exist in `symptom_frequency`. Normalized duplicate catalog entries are rejected rather than silently double-counted.

## Inference model

All symptom names are trimmed, lowercased, and normalized to single spaces. `canonicalKey` removes duplicates, sorts alphabetically, and joins with `|`. Thus `["Fever", " fatigue "]` becomes `fatigue|fever`.

Observed symptoms start at depth 0 with a score of 1. For each iteration:

1. Generate combinations containing at least one new or improved symptom, bounded by `metadata.configuration.max_antecedent_size`.
2. Look up their canonical keys directly. The engine never scans the global rule map.
3. Gather evidence and compute each path's score.
4. Accept new candidates at or above the threshold, ranked by score, lift, support, and occurrence count.
5. Keep at most the selected top K new symptoms and repeat until the depth limit or exhaustion.

Defaults: minimum score **70%**, maximum depth **3**, maximum new candidates per depth **5**. Controls support depths 1–6 and 1–12 new candidates per depth.

### Direct confidence versus inference score

**Direct confidence** belongs to one association rule: the fraction of transactions containing its antecedents that also contain its consequent.

**Inference score** is a propagation heuristic:

```text
parentScore = minimum score among all antecedents
pathScore   = rule.confidence × parentScore
candidateScore = maximum score across its evidence paths
```

For observed A, C, and F:

```text
{A, C} → B with confidence .90: B score = .90, depth 1
{B, F} → D with confidence .80: D score = .80 × min(.90, 1) = .72, depth 2
```

The 72% value is not a calibrated probability of D given A, C, and F. Association rules may be correlated, so multiple evidence scores are never multiplied together. Every evaluated, cycle-free rule path to an accepted candidate is retained, including weaker paths. Unaccepted candidates cannot propagate.

If a stronger path reaches an accepted symptom, its best score updates while its original discovery depth remains unchanged. A score/lineage signature marks affected antecedents for re-scoring; cached rule lookups avoid fetching or evaluating unchanged keys again. Individual evidence paths also retain their propagation depth, parent score, and lineage. The controls bound exploration iterations; an improvement on the final iteration cannot propagate beyond that limit.

Observed symptoms cannot be re-inferred. Per-path lineage rejects cyclic evidence. A 250,000-combination work budget additionally protects against unusually large observations or antecedent sizes; hitting it produces an explicit partial-result notice. Cancelling invalidates stale messages and aborts work between batches.

`RuleSource` is the engine's provider contract. `InMemoryRuleSource` implements direct local lookup; a future batched provider could implement the same contract without changing the inference algorithm or presentation components. The current implementation always uses the one-download/local-computation architecture.

## Network and controls

- Each rule has a separate diamond connector. All antecedents feed that diamond, which points to the consequent. This preserves joint-antecedent semantics.
- Rounded symptom nodes show observation state or inference score and discovery depth.
- Only selected observations, accepted candidates, and their evaluated evidence appear.
- Click a symptom or rule to inspect the candidate; its upstream evidence is highlighted.
- Pan, zoom, fit, center, reset, collapse depth, and filter by depth or displayed inference score.
- The inference threshold controls acceptance on the next discovery run; the graph's score filter only changes the current view.
- Changed selections/settings mark existing results as stale until discovery runs again.
- The result summary and observed-symptom buttons offer keyboard access to the canvas's evidence inspector.
- Search supports Up/Down, Enter, Escape, Backspace, mouse selection, and duplicate prevention.
- Native dialog focus management, reduced-motion support, semantic controls, responsive layouts, and self-hosted fonts are included.

## AWS S3 and CloudFront

Build with the intended API URL and upload **the contents of `dist/`** to the frontend S3 origin, including `assets/`, the worker, fonts, and favicon. There is no Node service to deploy.

Use a regular S3 bucket origin with CloudFront Origin Access Control to keep the bucket private; OAC does not apply to S3 website endpoints. Set CloudFront's default root object to `index.html`. See [AWS's S3 origin access guidance](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html).

Use HTTPS and appropriate content types for HTML, JavaScript, CSS, SVG, and WOFF2 files. Hashed assets can be cached long-term; revalidate `index.html` and invalidate it when releasing a new build. This application has a single root route and needs no client-side deep-route rewrite.

Allow the frontend origin in the existing API's CORS settings, including the Vite origin during local development. The frontend sends a GET request with `Accept: application/json` and no credentials. See [API Gateway HTTP API CORS documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html); configure the equivalent response headers for a REST API.

If using a Content Security Policy, allow the API origin in `connect-src` and same-origin workers in `worker-src`. No third-party font host is required.

This repository does not provision AWS infrastructure, deploy resources, or change the existing backend.

## Structure

```text
src/
  api/                Fetch-once cache, validation, rule provider
  components/         Selector, controls, methodology
    graph/            Cytoscape, graph construction, evidence inspector
    results/          Candidate summaries by depth
  hooks/              Dataset loading and worker lifecycle
  inference/          Canonical keys, frontier combinations, scoring, engine, worker
  trie/               Frequency-ranked prefix index and dataset cache
  types/              Strict API, inference, and graph contracts
  test/               Test-only fixtures
  utils/              Formatting
  App.tsx
  styles.css
```

Tests cover canonicalization, frequency-ranked Trie search, combinations, direct and recursive inference, joint antecedents, cycle prevention, multiple paths, score improvements, threshold/top-K/depth limits, deterministic ranking, cancellation, malformed responses, one-request caching, explicit retry, and rule-diamond graph semantics.
