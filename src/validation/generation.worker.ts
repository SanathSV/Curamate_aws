/// <reference lib="webworker" />
import { generateLatent } from './generate';
import type { GenerationRequest, GenerationResponse } from './types';
const worker = self as unknown as DedicatedWorkerGlobalScope;
const send = (message: GenerationResponse) => worker.postMessage(message);
worker.onmessage = async ({ data: request }: MessageEvent<GenerationRequest>) => {
  try {
    let processed = 0;
    for (const input of request.inputs) {
      const output = await generateLatent(request.data, input, request.options, request.latentLimit);
      send({ type: 'progress', output, processed: ++processed });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    send({ type: 'complete' });
  } catch (error) { send({ type: 'error', message: error instanceof Error ? error.message : 'Latent generation failed.' }); }
};
