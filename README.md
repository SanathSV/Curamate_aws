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

`fetchRules(): Promise<RulesOutput>` in `src/api/rulesApi.ts` shares a module-level promise. Concurrent callers, completed callers, and React StrictMode remounts reuse that promise. Selecting symptoms, changing settings, and running inference never trigger a new dataset request. **Reload dataset** explicitly calls `reloadRules()` to make one fresh API request, even after a successful load; simultaneous reloads share the in-flight request. A rejected request remains cached until an explicit retry/reload. Requests time out after 30 seconds.

The dataset is cached in browser memory, not localStorage or IndexedDB. Refreshing or closing the tab clears it; a new page load fetches again. The theme preference alone is saved in localStorage. A failed manual reload preserves the previous dataset in the UI with a visible warning. A successful reload resets old inference results and rebuilds the worker/Trie for the new dataset.

The worker receives the validated dataset once when initialized; subsequent messages contain only observations and inference settings. Rules remain in memory for the page session. Symptoms and exploration results are not persisted or sent to the backend.

The API returns the JSON object with `metadata`, `symptom_frequency`, and `rules`. The loader also accepts an API Gateway envelope with a JSON string or object in `body`. Strict interfaces are in `src/types/rules.ts`. Both reduced and richer metadata are supported. Optional `top_k_per_antecedent` metadata may be absent, null, blank, or a numeric string; it does not control the frontend's per-depth candidate limit.

Validation checks structure, finite numeric metrics, probability/confidence/support bounds, integer counts, normalized names, antecedent size, and catalog membership. Every symptom used by a rule must exist in `symptom_frequency`. Normalized duplicate catalog entries are rejected rather than silently double-counted.

## Inference model

All symptom names are trimmed, lowercased, and normalized to single spaces. `canonicalKey` removes duplicates, sorts alphabetically, and joins with `|`. Thus `["Fever", " fatigue "]` becomes `fatigue|fever`.

Observed symptoms start at depth 0 with a score of 1. For each iteration:

1. In the default **Single symptom · P(B | A)** mode, query only single-symptom keys for new or improved symptoms. In **Combined symptoms** mode, generate combinations containing at least one new or improved symptom, bounded by `metadata.configuration.max_antecedent_size`.
2. Look up their canonical keys directly. The engine never scans the global rule map.
3. Gather evidence and compute each path's score.
4. Accept new candidates at or above the threshold, ranked by score, lift, support, and occurrence count.
5. Keep at most the selected top K new symptoms and repeat until the depth limit or exhaustion.

Defaults: minimum score **70%**, maximum depth **3**, maximum new candidates per depth **5**. Controls support depths 1–6 and 1–12 new candidates per depth.

### Direct confidence versus inference score

**Direct confidence** belongs to one association rule: the fraction of transactions containing its antecedents that also contain its consequent.

In single-symptom mode the engine calculates `P(B | A) = occurrences(A and B) / occurrences(A)` using the API's `occurrences` and `antecedent_occurrences` fields. For example, if 10 of 14 records with A also contain B, confidence is 71.43%. A record still counts if it also contains C, D, or E. The counts must already aggregate across those other symptoms on the backend; the frontend has no raw records to reconstruct missing pair counts. Contradictory counts are rejected. Zero-occurrence pairs are never propagated, including at a zero threshold.

This differs from `P(A | B)`, which uses the number of B records as its denominator. In combined-symptom mode the engine preserves the API's confidence for the complete antecedent set.

**Inference score** is a propagation heuristic:

```text
parentScore = minimum score among all antecedents
pathScore   = rule.confidence × parentScore
candidateScore = maximum score across its evidence paths
```

For observed A, C, and F in combined-symptom mode:

```text
{A, C} → B with confidence .90: B score = .90, depth 1
{B, F} → D with confidence .80: D score = .80 × min(.90, 1) = .72, depth 2
```

The 72% value is not a calibrated probability of D given A, C, and F. Association rules may be correlated, so multiple evidence scores are never multiplied together. Every evaluated, cycle-free rule path to an accepted candidate is retained, including weaker paths. Unaccepted candidates cannot propagate.

If a stronger path reaches an accepted symptom, its best score updates while its original discovery depth remains unchanged. A score/lineage signature marks affected antecedents for re-scoring; cached rule lookups avoid fetching or evaluating unchanged keys again. Individual evidence paths also retain their propagation depth, parent score, and lineage. The controls bound exploration iterations; an improvement on the final iteration cannot propagate beyond that limit.

Observed symptoms cannot be re-inferred. Per-path lineage rejects cyclic evidence. A 250,000-combination work budget additionally protects against unusually large observations or antecedent sizes; hitting it produces an explicit partial-result notice. Cancelling invalidates stale messages and aborts work between batches.

`RuleSource` is the engine's provider contract. `InMemoryRuleSource` implements direct local lookup; a future batched provider could implement the same contract without changing the inference algorithm or presentation components. The current implementation always uses the one-download/local-computation architecture.

## Patient context in combined inference

Datasets may include an optional `context_frequency` catalog with the same `{ count, probability }` entries as `symptom_frequency`. Its tokens use `gender:<value>` or `history:<value>`. The optional `metadata.configuration.max_context_features` limits context tokens per antecedent; `max_antecedent_size` continues to limit symptom tokens separately. If the context limit is omitted, combinations are bounded by the available selected contexts. Older datasets without either addition remain supported.

The optional **Patient context** gender dropdown and searchable history multi-select appear directly in the main composer alongside symptom input, outside Settings. Choose **Combined symptoms** in Settings to apply them during inference. Search history by any part of its name, use the arrow keys and Enter to select, and remove selected items with their chip's remove button. Options come only from `context_frequency`. Selecting context does not change the symptom Trie or send another API request. Gender is a single selection; history supports multiple selections. New exploration clears both, and a successful dataset reload removes selections absent from the new catalogs.

The worker receives `observations: string[]` and `contexts: string[]` separately. Context is fixed evidence with score 1 and depth 0. For each symptom combination, the engine looks up the symptom-only key and its combinations with selected context subsets, preserving canonical alphabetical sorting with `|`. For observations `cough`, `fever` and contexts `gender:male`, `history:asthma`, lookups can include `cough|fever`, `cough|gender:male`, and `cough|fever|gender:male|history:asthma`, subject to the two size limits and available backend keys. Each lookup contains at least one symptom; context is not a new inference frontier.

Normal antecedent tokens must belong to `symptom_frequency`; context antecedents must belong to `context_frequency`; every `then` must be a symptom. Reserved context tokens are rejected from the symptom catalog and never become candidates, path symptoms, or recursive discoveries. Context-conditioned direct confidence uses `occurrences / antecedent_occurrences`. The existing propagation formula, threshold, depth, and graph candidate limits remain unchanged.

The graph shows selected context as separate badges, and context-conditioned evidence links label the context they use. Context never appears as a symptom circle. The evidence inspector shows context badges instead of clickable symptom controls. Changing context marks existing results as stale until discovery runs again.

Single-symptom inference, the **All symptom paths** list, and the **Compare symptom likelihoods** table retain their symptom-only behavior; selected patient context applies only to combined graph inference.

## Every individual symptom path

Discovery also runs `findSymptomPaths` in the worker. The **All symptom paths** section lists every qualifying ordered, cycle-free pairwise path within the selected maximum depth, including prefixes and alternative routes to the same endpoint. Each selected symptom starts an independent search; another selected symptom can appear along that path, but no symptom repeats within one path. This list always uses single-symptom rules, even when the graph is exploring combined antecedents.

Set **Minimum path score** in Settings (slider or numeric percentage), choose the depth, and run discovery. Every row shows the complete sequence, every link's empirical confidence and counts, and the product of those confidences. For example, A -> B at 90% and B -> C at 80% yields A -> B -> C with score 72%. A 73% threshold excludes that path even though both links individually exceed 73%. A multi-step score is a heuristic, not a joint or calibrated conditional probability.

The graph's top-K limit and display filters never prune this list. Results are sorted by score and paginated at 50 rows; **Download JSON** exports all returned paths with threshold, depth, counts, and completeness status. Available rules may already have been filtered by the backend; the browser cannot reconstruct absent rules or joint symptom frequencies from pair counts.

```ts
import { InMemoryRuleSource } from './src/api/rulesApi';
import { findSymptomPaths } from './src/inference/paths';

const result = await findSymptomPaths(
  new InMemoryRuleSource(validatedDataset),
  ['fever'],
  { minScore: 0.7, maxDepth: 3 },
);
console.log(result.paths); // [{ symptoms, steps, score, depth }, ...]
console.log(result.truncated, result.limitReason);
```

The function uses cached local rule lookups, accepts an optional AbortSignal, and yields during traversal for cancellation. It stops at 50,000 paths or 250,000 edge evaluations; hitting a limit explicitly labels the list and export as partial. Reduce depth or raise the threshold to narrow an oversized search. Limits can be lowered via `maxPaths` and `maxEvaluations`. Enumeration does not call the API again.

## Compare symptom likelihoods

The **Compare symptom likelihoods** section requires **all selected starting symptoms together**. Choose A and B under **Given all of these symptoms**, then choose target symptoms or leave the target selector empty to compare all other symptoms. **Use observed symptoms** copies the explorer's current observations into this independent comparison. Results update immediately; no discovery run or extra API request is needed.

For each target X, the table shows:

- `P(X | A AND B) = count(A AND B AND X) / count(A AND B)`, with the supporting numerator and denominator.
- X's overall dataset frequency, `count(X) / total records`.
- The difference between the conditional and overall frequencies, in percentage points (pp).

Extra symptoms in a record do not exclude it. For example, 8 records containing X out of 10 records containing both A and B gives 80%. If X appears in 20 of 100 records overall, the difference is +60 percentage points. These are empirical dataset associations, not individual predictions. Unlike multi-step path scores, this comparison uses direct occurrence counts for the complete selected antecedent set.

The comparison looks up the exact canonical joint rule, such as `a|b -> x`. If that rule is missing, it displays **Not available**; it never substitutes 0% or multiplies separate pairwise probabilities. A dataset containing only single-symptom antecedents supports single-starting-symptom comparisons but cannot supply multi-symptom comparisons without joint counts from the backend. Recorded zero occurrences produce 0%; a zero antecedent denominator produces **No matching records**; contradictory counts produce **Inconsistent counts**.

Targets exclude the starting symptoms. Results can be sorted by conditional likelihood or symptom name and are paginated at 15 rows. Graph thresholds, path depth, and graph candidate limits do not filter this table. **New exploration** clears comparison selections, and a dataset reload recalculates against the replacement data.

## Network and controls

- Circular symptom nodes have always-visible labels showing observation state or inference score and discovery depth.
- Single-antecedent rules use ordinary directed links labeled with direct confidence. Joint rules use a shared diamond joining all required antecedents.
- Only selected observations, accepted candidates, and their evaluated evidence appear.
- Click a symptom or rule to inspect the candidate; upstream evidence is highlighted without fading unrelated nodes or edges.
- Pan, zoom, fit, center, reset, and filter by depth or displayed inference score.
- Expand the graph to fill the workspace and restore it with the same button or Escape. The graph is displayed inline by default, without opening a tab or toggle.
- The inference threshold controls acceptance on the next discovery run; the graph's score filter only changes the current view.
- Changed selections/settings mark existing results as stale until discovery runs again.
- The result summary and observed-symptom buttons offer keyboard access to the canvas's evidence inspector.
- Search supports Up/Down, Enter, Escape, Backspace, mouse selection, and duplicate prevention.
- The interface uses a compact console layout with a bottom symptom composer and settings menu. Dark theme is the default; a light theme switch is available.
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
    results/          Candidate summaries, individual paths / export, joint comparisons
  hooks/              Dataset loading, worker lifecycle, and theme preference
  inference/          Canonical keys, combinations, scoring, engine, path search, worker
  trie/               Frequency-ranked prefix index and dataset cache
  types/              Strict API, inference, and graph contracts
  test/               Test-only fixtures
  utils/              Formatting
  App.tsx
  main.tsx
  styles.css
```

## File objectives

The tables below cover every source, test, asset, and project configuration file. File links are relative to this README. Generated output and local-only settings are described separately at the end.

### Application entry and presentation

| File | Objective |
| --- | --- |
| [index.html](index.html) | Provide the HTML page, React root element, page metadata, and frontend entry script. |
| [src/main.tsx](src/main.tsx) | Load the fonts and global styles, then mount the React application with StrictMode. |
| [src/App.tsx](src/App.tsx) | Coordinate the workspace: selected symptoms, inference settings, dataset status, discovery, graph expansion, results, evidence selection, and manual reload. |
| [src/styles.css](src/styles.css) | Define dark/light themes, responsive console layout, graph workspace, composer, controls, evidence panels, and paginated path presentation. |
| [public/favicon.svg](public/favicon.svg) | Supply the application icon used by the browser tab. |
| [src/utils/format.ts](src/utils/format.ts) | Format percentages, record counts, and compact numbers consistently across the interface. |

### Dataset access, state, and symptom search

| File | Objective |
| --- | --- |
| [src/api/rulesApi.ts](src/api/rulesApi.ts) | Fetch and validate the API dataset, unwrap supported API Gateway responses, normalize rules, cache requests, support manual reload, and expose `RuleSource` / `InMemoryRuleSource` for local rule lookup. |
| [src/hooks/useRules.ts](src/hooks/useRules.ts) | Connect dataset loading to React: expose data, loading/errors, loaded time, retry/reload actions, and the symptom Trie; preserve the previous dataset if reload fails. |
| [src/hooks/useInference.ts](src/hooks/useInference.ts) | Create and initialize the worker, submit discovery requests, receive results/errors, reject stale responses, and support cancellation and cleanup. |
| [src/hooks/useTheme.ts](src/hooks/useTheme.ts) | Switch between dark and light themes, update browser theme metadata, and persist the theme preference in localStorage. |
| [src/trie/Trie.ts](src/trie/Trie.ts) | Implement prefix search with frequency-ranked suggestions, duplicate prevention, result limits, and exclusion of already selected symptoms. |
| [src/trie/symptomTrie.ts](src/trie/symptomTrie.ts) | Build a Trie from dataset symptom frequencies and reuse it while the same frequency object remains loaded. |

### Inference and individual paths

| File | Objective |
| --- | --- |
| [src/inference/canonicalize.ts](src/inference/canonicalize.ts) | Normalize symptom names, produce sorted and deduplicated antecedent keys, and format symptom labels for display. |
| [src/inference/context.ts](src/inference/context.ts) | Identify reserved gender/history context tokens and format separate patient-context labels. |
| [src/inference/combinations.ts](src/inference/combinations.ts) | Generate antecedent combinations containing new/changed symptoms, with optional fixed context subsets and independent limits on symptom and context counts. |
| [src/inference/scoring.ts](src/inference/scoring.ts) | Calculate empirical conditional confidence from occurrence counts, reject inconsistent counts, propagate scores, and rank evidence/candidates deterministically. |
| [src/inference/engine.ts](src/inference/engine.ts) | Discover graph candidates through pairwise or combined rules; enforce score, depth, top-K, cycle, and work limits while retaining candidate evidence. |
| [src/inference/paths.ts](src/inference/paths.ts) | Export `findSymptomPaths` and its result types; enumerate each qualifying ordered pairwise path independently of graph top-K, preserving alternative routes, per-link counts/confidences, total scores, and explicit cutoff status. |
| [src/inference/compareSymptoms.ts](src/inference/compareSymptoms.ts) | Calculate count-based conditional likelihoods (joint antecedents by default), overall target frequencies, and percentage-point differences; distinguish missing rules, zero denominators, and inconsistent counts. |
| [src/inference/inference.worker.ts](src/inference/inference.worker.ts) | Run candidate inference and individual path enumeration off the UI thread using the loaded dataset; handle initialization, cancellation, results, errors, and total runtime. |
| [src/inference/protocol.ts](src/inference/protocol.ts) | Define the typed messages exchanged between the React application and the worker. |

`engine.ts` answers “Which candidates should appear in the graph?”; `paths.ts` answers “Which individual symptom sequences meet my threshold?” Both use the loaded rules locally, but only graph discovery applies the candidate-per-depth limit.

### Input controls and result components

| File | Objective |
| --- | --- |
| [src/components/SymptomMultiSelect.tsx](src/components/SymptomMultiSelect.tsx) | Provide reusable symptom autocomplete, keyboard navigation, selected chips, configurable accessible labels, and exclusions for the explorer and comparison selectors. |
| [src/components/InferenceControls.tsx](src/components/InferenceControls.tsx) | Let users select rule mode, specify a numeric or slider threshold, choose maximum depth, adjust graph candidates per depth, and restore defaults. |
| [src/components/PatientContext.tsx](src/components/PatientContext.tsx) | Provide the optional gender selector and history multi-select from the context catalog, with context badges and mode guidance. |
| [src/components/Methodology.tsx](src/components/Methodology.tsx) | Explain the inference model, evidence propagation, and the distinction between association scores and clinical probabilities in a dialog. |
| [src/components/results/InferenceResults.tsx](src/components/results/InferenceResults.tsx) | Group graph candidates by discovery depth and provide selectable rows for inspecting their evidence. |
| [src/components/results/SymptomPaths.tsx](src/components/results/SymptomPaths.tsx) | Display individual symptom sequences with scores and link counts, paginate results, flag partial searches, and download the complete returned result as JSON. |
| [src/components/results/SymptomComparison.tsx](src/components/results/SymptomComparison.tsx) | Let users select joint starting symptoms and targets, copy observations, and compare conditional likelihoods against overall frequencies with sorting, pagination, and explicit unavailable states. |

### Graph rendering and evidence

| File | Objective |
| --- | --- |
| [src/components/graph/buildGraph.ts](src/components/graph/buildGraph.ts) | Convert observations and candidate evidence into graph elements: symptom nodes, direct single-antecedent links, and shared diamonds for joint rules. |
| [src/components/graph/SymptomGraph.tsx](src/components/graph/SymptomGraph.tsx) | Manage the Cytoscape canvas, layout, theme, labels, selection, evidence highlighting, visibility filters, resizing, and graph navigation methods. |
| [src/components/graph/GraphControls.tsx](src/components/graph/GraphControls.tsx) | Provide zoom, fit, center, and reset buttons with the current zoom level. |
| [src/components/graph/NodeDetails.tsx](src/components/graph/NodeDetails.tsx) | Show an observed symptom's frequency or a candidate's evidence, rule metrics, direct conditional confidence, propagation formula, and alternative evidence. |

### Shared data contracts

| File | Objective |
| --- | --- |
| [src/types/rules.ts](src/types/rules.ts) | Describe API rules, occurrence counts, separate symptom/context frequency catalogs, metadata/configuration (including context limits), and the complete dataset shape. |
| [src/types/inference.ts](src/types/inference.ts) | Describe inference settings, evidence, candidates, and results, including optional path-search results; define default settings. |
| [src/types/graph.ts](src/types/graph.ts) | Define the graph handle used by controls to fit, center, reset, zoom, or focus the graph. |

### Tests and fixtures

| File | Objective |
| --- | --- |
| [src/test/fixtures.ts](src/test/fixtures.ts) | Create small synthetic rules and datasets for repeatable tests without calling the live API. |
| [src/api/rulesApi.test.ts](src/api/rulesApi.test.ts) | Verify response validation, optional/numeric metadata handling, wrapped responses, request caching, retry, and manual reload behavior. |
| [src/trie/Trie.test.ts](src/trie/Trie.test.ts) | Verify prefix matching, frequency ordering, normalization, exclusions, and reuse of the dataset search index. |
| [src/inference/canonicalize.test.ts](src/inference/canonicalize.test.ts) | Verify normalized symptom keys and unique, bounded antecedent combinations, including frontier filtering. |
| [src/inference/engine.test.ts](src/inference/engine.test.ts) | Verify joint and pairwise inference, recursion, evidence ranking, counts-based confidence, cycle prevention, cancellation, and threshold/depth/top-K limits. |
| [src/inference/inference.worker.test.ts](src/inference/inference.worker.test.ts) | Verify that worker messages carry observations and contexts separately, combined results use context, and individual paths remain symptom-only. |
| [src/inference/paths.test.ts](src/inference/paths.test.ts) | Verify complete ordered path enumeration on small networks, independent alternative routes, full-path thresholds, counts, cycle prevention, deduplication, cancellation, and explicit safety cutoffs. |
| [src/inference/compareSymptoms.test.ts](src/inference/compareSymptoms.test.ts) | Verify joint conditioning, single-source comparisons, count-based likelihoods, baseline differences, normalized selections, and missing/zero/inconsistent data handling. |
| [src/components/graph/buildGraph.test.ts](src/components/graph/buildGraph.test.ts) | Verify direct pairwise links, shared joint-rule diamonds, and graph filtering without dangling edges. |

### Build, configuration, and project documentation

| File | Objective |
| --- | --- |
| [package.json](package.json) | Declare the Node requirement, runtime/development dependencies, and commands for development, tests, builds, and preview. |
| [package-lock.json](package-lock.json) | Pin the resolved dependency tree so `npm ci` can reproduce installations. |
| [vite.config.ts](vite.config.ts) | Configure React and Tailwind, worker module output, the separate Cytoscape bundle, and Vitest test discovery/environment. |
| [tsconfig.json](tsconfig.json) | Configure strict TypeScript checking, browser/module support, JSX compilation, and included source files. |
| [.env.example](.env.example) | Provide the public API URL configuration template to copy into local settings. |
| [.gitignore](.gitignore) | Exclude dependencies, build output, local environment settings, TypeScript build metadata, and coverage artifacts from Git. |
| [.github/workflows/ci.yml](.github/workflows/ci.yml) | On pushes and pull requests to `main`, install dependencies, run tests, build with the configured API URL, and upload `dist/` as a CI artifact. It does not deploy to AWS. |
| [README.md](README.md) | Explain setup, data flow, inference and path semantics, controls, deployment requirements, and each file's responsibility. |

### Local settings and generated output

| File or directory | Objective |
| --- | --- |
| `.env.local` | Store this checkout's public `VITE_RULES_API_URL`; created locally and excluded from Git. |
| `dist/index.html` | Generated production HTML referencing the built assets. |
| `dist/assets/` | Generated application and graph JavaScript, worker code, CSS, and bundled fonts; filenames include build hashes. |
| `dist/favicon.svg` | Production copy of the source favicon. |
| `node_modules/` | Installed third-party packages managed by npm. |
| `tsconfig.tsbuildinfo` | Generated TypeScript build metadata; not application source. |

Edit source/configuration files rather than generated output, then rebuild `dist/` when preparing a release.

Tests cover canonicalization, frequency-ranked Trie search, combinations, direct and recursive inference, joint antecedents, cycle prevention, multiple paths, score improvements, threshold/top-K/depth limits, deterministic ranking, cancellation, malformed responses, one-request caching, explicit retry, and rule-diamond graph semantics.
