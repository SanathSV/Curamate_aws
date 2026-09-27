# CuraMate Validation Lab

## Location and implementation

Open **Validation Lab** in the workspace tabs or desktop sidebar. It is a separately lazy-loaded view (`validation-panel`), not a new diagnosis mode. Clinical input, diagnosis results, comparison state, and collapse controls remain intact when switching tabs. The lab stays mounted so navigation does not discard an experiment.

Created files:

- `src/validation/types.ts`: dataset, worker, request, response and batch interfaces.
- `src/validation/dataset.ts`: inspection, explicit feature projection, original-preserving payload assembly.
- `src/validation/generate.ts`, `generation.worker.ts`: existing latent algorithm in a dedicated worker.
- `src/validation/api.ts`: Lambda 4 configuration, transport and response adapter.
- `src/validation/aggregate.ts`: count aggregation, weighted ranks and exact medians where available.
- `src/validation/useValidationLab.ts`: upload, generation, review, evaluation, cancellation, retries and report state.
- `src/components/validation/ValidationLab.tsx`: workflow, upload, settings and real progress.
- `src/components/validation/LabRecords.tsx`: inspection, record dialog and before/after review.
- `src/components/validation/LabResults.tsx`: metrics, grouped bars, diagnosis table, record explorer, quality and export.
- `src/components/validation/validation.css`: responsive styles using existing color variables.
- `src/validation/validation.test.ts`, `useValidationLab.test.ts`, `api.test.ts`: algorithm parity, leakage, aggregation and workflow regression tests.

Modified files: `src/App.tsx` (navigation and lazy loading), `src/App.test.ts` (navigation regression), `src/styles.css` (view sizing), `.env.example`, and `README.md`.

## Lambda 4 configuration

Put the real deployed URL in `.env.local` at the project root:

```dotenv
VITE_LAMBDA4_EVALUATION_URL=<your real Lambda 4 URL>
```

Restart Vite after changing the environment. For production, set this at build time and rebuild. This is a public frontend endpoint, never a secret. `.env.example` contains a blank variable; no URL or backend is invented. The lab never falls back to Lambda 3. Lambda 4 must allow the app origin through CORS and accept JSON POST requests.

Without this variable, local upload, inspection, latent generation and transformation review work; **Run Validation** is disabled with setup instructions.

## Existing functions reused

`normalizeSymptom`, `filterDatasetByGender`, `InMemoryRuleSource`, `infer(..., collectAllCandidates=true)`, and `buildRagCombinations` are the same functions used by the clinical workflow. Selected candidate additions are collected into `latent_symptoms`, as required by the Lambda 4 two-pass contract. The clinical workflow's separate one-addition combinations are not changed.

The lab snapshots the clinical inference settings and latent limit on first opening. Its subsequent settings are independent. Path score, depth, mode and latent limit can be changed between experiments. Support/confidence/lift thresholds are read from the loaded rule metadata; they remain read-only, matching the clinical workflow. Changing those mining thresholds requires a rebuilt rules dataset. The graph-only candidate display limit is not applied to diagnostic latent expansion.

Rules are loaded by the existing cached `VITE_RULES_API_URL` request, not a second rules fetch. Each generation worker receives one rules snapshot.

## Input and preservation

The uploaded JSON root must be a non-empty array, up to 50 MB. Each record requires a non-empty `current_symptoms` string array, a non-empty `gender` string and a non-empty `concluded_diagnosis`. Supplied history must be a string array; omitted history is warned about and becomes `[]`. Age and vitals are optional; supplied malformed values are errors. Every invalid row stays inspectable. Continuing with valid rows is explicit.

`current_symptoms` is copied unchanged, preserving spelling, order and duplicates. Only a separate normalized working list is used for inference. Generated symptoms are normalized, deduplicated and excluded if already present in the original list. Uploaded pre-existing latent symptoms are ignored with a warning. Optional supported age/vitals fields are copied. Extra input fields are visible in the raw inspection view but are not sent to Lambda 4.

The generation worker receives only `{ index, symptoms, gender, history }`. It never receives `concluded_diagnosis`, the original raw record, vitals or age. Ground truth is reattached outside the worker when creating the evaluation payload. The backend must likewise keep labels outside both prediction passes; frontend code cannot enforce backend internals.

Symptoms/context missing from the local rules catalog are explicitly flagged, excluded from local rule lookup, and preserved in the original evaluation input. This does not assert that the backend model also lacks those features. Truncated inference searches are flagged in review, quality metrics and exports.

## Exact request

A user click on **Run Validation**, after transformation review, sends:

```json
{
  "diagnosis_top_k": 5,
  "records": [
    {
      "age": 28,
      "gender": "female",
      "current_symptoms": ["abdominal pain", "nausea"],
      "latent_symptoms": ["cramping", "vaginal bleeding"],
      "history": ["autoimmune disease"],
      "vitals": { "bp": "166/94", "hr": 85 },
      "concluded_diagnosis": "ectopic pregnancy"
    }
  ]
}
```

The values above illustrate the shape; the frontend never fabricates generated symptoms. Missing optional age/vitals fields are omitted. No frontend diagnosis predictions are made. Top-K defaults to 5 and is configurable from 5 to 100 so the dashboard can consistently compare Top-1/3/5.

## Response adapter contract

The required summary is the specification's `summary`: received/evaluated/unknown-ground-truth counts, raw Top-1/3/5 correct counts for both passes, optional average ranks, and improved/worsened/unchanged counts. Batch percentage fields are ignored; exported accuracies are recomputed from counts. API Gateway `{ "body": "...JSON..." }` envelopes are accepted.

Every received record must be either evaluated or unknown ground truth, and outcomes must sum to evaluated records. Invalid or inconsistent metrics fail the batch instead of corrupting the report. If the deployed backend introduces additional skip categories, update `types.ts` and `api.ts` to account for their denominators explicitly.

Optional detailed response shapes, which were not fully defined in the original specification, are isolated in the adapter:

```json
{
  "records": [
    {
      "record_index": 0,
      "outcome": "improved",
      "without_latent": {
        "ground_truth_rank": 3,
        "diagnoses": [
          { "rank": 1, "diagnosis": "candidate a" },
          { "rank": 2, "diagnosis": "candidate b" },
          { "rank": 3, "diagnosis": "ground truth" }
        ]
      },
      "with_latent": {
        "ground_truth_rank": 1,
        "diagnoses": [{ "rank": 1, "diagnosis": "ground truth" }]
      },
      "unknown_model_features": []
    }
  ],
  "per_diagnosis": [
    {
      "diagnosis": "ground truth",
      "support": 1,
      "without_latent": {
        "top_1_correct": 0,
        "top_3_correct": 1,
        "top_5_correct": 1,
        "average_ground_truth_rank": 3
      },
      "with_latent": {
        "top_1_correct": 1,
        "top_3_correct": 1,
        "top_5_correct": 1,
        "average_ground_truth_rank": 1
      }
    }
  ]
}
```

`record_index` is zero-based within the submitted batch. The client maps it back to the original uploaded row, including gaps left by invalid records. Outcomes are `improved`, `worsened`, `unchanged`, or `unknown` (`unknown_ground_truth` is also accepted). Ground-truth rank may be null if unavailable/not ranked. `summary.unknown_model_features`, if supplied, is a count of feature occurrences; per-record unknown features are name arrays. Summary-only responses work and explicitly show that detailed records/diagnosis metrics were not returned. No missing details are invented.

## Batching, cancellation and progress

Default batch size is 100, editable from 1 to 500. Requests run sequentially, including a final smaller batch. Each has a 120-second timeout and an abort signal. Successful batches are retained in memory. On failure, **Retry Batch** starts at the first unfinished batch, preserving successful results and the experiment's settings. **Cancel** aborts the in-flight request and allows resume. Late worker messages and HTTP responses are ignored after cancellation or replacement.

Generation progress = completed records / valid records. Evaluation progress = records in completed batches / submitted records. The UI does not guess server-side progress inside an in-flight batch. Evaluated records and unknown labels are shown separately. Elapsed time uses the clock; progress does not. Cancelling generation terminates the worker; restarting generates the full set again.

## Aggregation and export

For each pass, sum raw Top-K correct counts and divide by the sum of `records_evaluated`. Unknown ground truths never enter that denominator. Improved, worsened, unchanged and unknown counts are summed.

Average ranks are weighted by `ground_truth_rank_count`, when provided, or `records_evaluated` otherwise. The default assumes the backend average covers all evaluated records. If it averages only records with a known rank, it must supply `ground_truth_rank_count`. Missing batch averages make the combined average unavailable. Medians are never averaged: the client computes an exact global median from complete record-level ranks, or displays a supplied median only for a single batch.

Per-diagnosis counts are summed by diagnosis and divided by support. Incomplete per-diagnosis coverage is visibly marked. Accuracy differences are percentage points; worse performance is not hidden.

**Download Evaluation Report** exports JSON with timestamp, completion status, upload/evaluation counts, Top-K, batch size, inference/rule settings, rules metadata, aggregate summary, per-diagnosis metrics, original and generated symptoms, record results, input issues and original batch responses. Partial reports are available after a failed/paused run with completed batches. Reports include ground truth and uploaded symptoms. Data and reports are not persisted automatically; refreshing the browser clears the session.

**Run Again With Different Thresholds** retains the original inspected dataset and clears all generated symptoms and evaluation batches. **Upload New Dataset** starts a separate experiment.

## Verification

Tests cover algorithm parity, label-free worker messages, preservation/deduplication, malformed input, absent details, unknown labels, unequal batch sizes, weighted ranks, UI inspection/review gates, sequential batches, retrying only failed work, cancellation and tab navigation. Production builds compile both workers and lazy-load the lab. Live Lambda 4 compatibility still requires the real deployed endpoint and confirmation of its optional detail field names.

Verified: 148 tests pass, production build succeeds, and the app and generation worker modules respond on port 5173. No live Lambda 4 request was made because its URL has not been supplied. Visual browser QA was unavailable in this session.


## Backend alignment update

The frontend consumes raw integer `top_*_correct` counts and server-provided `record.outcome`; it does not reconstruct counts from percentages or derive outcomes from ranks.

HTTP 400 `{ "error": "Batch validation failed", "invalid_records": [{ "record_index": 0, "error": "reason" }] }` rejects the whole batch. Invalid record indices are zero-based within that batch and are mapped to original uploaded row numbers in the UI. No rejected-batch metrics are aggregated. Completed earlier batches remain available, and rejected-record details are included in partial reports. Correct the input and upload a new experiment, or correct server settings before retrying the unchanged batch. Non-JSON gateway errors still retain their HTTP status.

The frontend latent limit is 100. The deployed Lambda must set `MAX_LATENT_SYMPTOMS=100` in its environment configuration. This backend value is not a Vite environment variable and has not been remotely verified: the active AWS CLI credentials could not locate the configured API. No cloud configuration was changed.


## One-click workflow update

The start screen now shows the JSON structure with required/optional field explanations and a downloadable example, plus all latent and evaluation settings before upload. Upload still only parses locally. The user clicks **Start validation** once to generate latent symptoms and automatically submit the resulting batches; no intermediate review confirmation is required. Invalid upload records are explicitly counted and excluded in the start action's label. Generation failures/cancellation stop the automatic chain. Endpoint and rules availability are required before starting.

Dataset inspection is an optional expandable panel before starting. The generated-symptom preview remains available during evaluation, after failure, and with results. All original-symptom preservation, ground-truth isolation, batch retries, progress and export behavior remains in effect. This supersedes the earlier manual generation/review/Run Validation sequence described above.
