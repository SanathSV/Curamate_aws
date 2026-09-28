# Natural-language symptom entry

The clinical picker defaults to the existing canonical autocomplete. Select **Describe a symptom** for the embedded composer. Only submitted descriptions go to Lambda5; recognized names enter the existing selection callback.

The default endpoint is `POST /lambda5`, with body `{"query":"My nose keeps dripping."}`. Optionally set `VITE_LAMBDA5_SYMPTOM_URL` to the deployed endpoint and restart Vite. The hosting server must route `/lambda5` to the service; cross-origin overrides require CORS support for the frontend origin, POST, and Content-Type.

Expected response:

```json
{"success":true,"query":"My nose keeps dripping.","prediction":{"symptom":"runny nose","confidence":0.9721},"alternatives":[{"symptom":"nasal congestion","confidence":0.0142},{"symptom":"sneezing","confidence":0.0061}]}
```

`NONE` displays rephrasing/manual-search guidance. Confidence >= 0.90 automatically adds the canonical symptom. Lower confidence offers the prediction, alternatives, and **None of these** for explicit confirmation. Choices are deduplicated and restricted to the available catalog; already selected symptoms cannot be added again.

Requests time out after 15 seconds. Retry is explicit; drafts survive errors. Switching modes, changing selection/catalog, disabling, cancelling, or unmounting aborts pending work and ignores stale results. Editing the draft or changing selection dismisses confirmation. Reduced motion is respected. Diagnosis, Apriori, Bayesian, Vector Search, and downstream inference are unchanged.
