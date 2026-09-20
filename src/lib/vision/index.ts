import type { VisionPipeline } from './types';
import { MediaPipeVisionPipeline, type MediaPipeVisionOptions } from './MediaPipeVisionPipeline';

export * from './types';
export * from './capability';

/**
 * Factory. Callers depend on this — not on the concrete implementation.
 * When we swap MediaPipe for a WebGPU-native or ONNX pipeline, only this
 * function changes.
 */
export function createVisionPipeline(opts?: MediaPipeVisionOptions): VisionPipeline {
  return new MediaPipeVisionPipeline(opts);
}
