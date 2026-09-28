/** Input-only Lambda5 adapter. No diagnosis or inference requests are changed. */
export interface SymptomPrediction { symptom: string; confidence: number }
export interface RecognitionResponse {
  success: true;
  query: string;
  prediction: SymptomPrediction;
  alternatives: SymptomPrediction[];
}
function isPrediction(value: unknown): value is SymptomPrediction {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SymptomPrediction>;
  return typeof candidate.symptom === 'string' && !!candidate.symptom.trim()
    && typeof candidate.confidence === 'number' && Number.isFinite(candidate.confidence)
    && candidate.confidence >= 0 && candidate.confidence <= 1;
}
export async function recognizeSymptom(query: string, signal: AbortSignal): Promise<RecognitionResponse> {
  const endpoint = import.meta.env.VITE_LAMBDA5_SYMPTOM_URL?.trim() || '/lambda5';
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) controller.abort();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }), signal: controller.signal,
    });
    if (!response.ok) throw new Error(response.status === 429
      ? 'Recognition is busy right now. Please try again in a moment.'
      : 'Recognition could not complete. Please retry or use manual search.');
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object'
      || !('success' in body) || body.success !== true
      || !('query' in body) || typeof body.query !== 'string'
      || !('prediction' in body) || !isPrediction(body.prediction)
      || !('alternatives' in body) || !Array.isArray(body.alternatives) || !body.alternatives.every(isPrediction)) {
      throw new Error('Recognition returned an unexpected response. Please use manual search or try again.');
    }
    return body as RecognitionResponse;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (timedOut) throw new Error('Recognition took too long. Please retry or use manual search.');
    if (error instanceof TypeError) throw new Error('Could not connect to symptom recognition. Please retry or use manual search.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}
