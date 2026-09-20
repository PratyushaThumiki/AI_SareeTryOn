import type { VTONInput, VTONModelSpec, VTONOutput } from './types';

/**
 * VTONInference
 *
 * ONNX Runtime Web wrapper for local, in-browser VTON model inference.
 *
 * All inference runs entirely in the browser using WebAssembly.
 * No data is sent over the network during inference.
 *
 * ONNX Runtime Web WASM files are loaded from the jsDelivr CDN
 * (already in the project's connect-src CSP). Only the ort runtime
 * JS itself is loaded from CDN — the model weights and all image
 * data stay local.
 *
 * MODEL WEIGHTS:
 *   Place the .onnx file at the path specified in VTONModelSpec.path
 *   (default: /models/dm-vton-student.onnx).
 *   Run /experiments/mobile-vton/scripts/06_export_dm_vton_onnx.py to generate.
 *
 * WHEN WEIGHTS ARE ABSENT:
 *   loadModel() throws ModelNotFoundError. Phase2VTONEngine catches this and
 *   reports a ready live preview with neural generation disabled.
 */
// Module-level cache so repeated engine inits (product switches) don't re-probe.
const modelProbeCache = new Map<string, boolean>();

export class VTONInference {
  private session: unknown | null = null; // InferenceSession, typed as unknown to avoid server-side ort import
  private spec: VTONModelSpec | null = null;

  async loadModel(spec: VTONModelSpec): Promise<void> {
    // Check cache first — avoid repeated 404 HEAD requests on product switches.
    if (modelProbeCache.has(spec.path)) {
      if (!modelProbeCache.get(spec.path)) {
        throw new ModelNotFoundError(
          `VTON model weights not found at ${spec.path}. ` +
          `Run experiments/mobile-vton/scripts/06_export_dm_vton_onnx.py to generate them, ` +
          `then place the output at public${spec.path}.`
        );
      }
    } else {
      // First time — probe the file.
      const probe = await fetch(spec.path, { method: 'HEAD' });
      modelProbeCache.set(spec.path, probe.ok);
      if (!probe.ok) {
        throw new ModelNotFoundError(
          `VTON model weights not found at ${spec.path}. ` +
          `Run experiments/mobile-vton/scripts/06_export_dm_vton_onnx.py to generate them, ` +
          `then place the output at public${spec.path}.`
        );
      }
    }

    // Dynamic import keeps onnxruntime-web out of the server bundle.
    const ort = await import('onnxruntime-web');

    // Load ONNX runtime WASM from jsDelivr CDN (already in CSP connect-src).
    // This ensures the WASM files don't need to be bundled with the app.
    ort.env.wasm.wasmPaths =
      'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';
    ort.env.wasm.numThreads = 1; // single thread — most browsers allow multi-thread only with COOP headers

    this.session = await ort.InferenceSession.create(spec.path, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });

    this.spec = spec;
  }

  async infer(input: VTONInput): Promise<VTONOutput> {
    if (!this.session || !this.spec) {
      throw new Error('VTONInference: model not loaded — call loadModel() first');
    }

    const ort = await import('onnxruntime-web');
    const { inputWidth: w, inputHeight: h } = this.spec;

    const t0 = performance.now();

    // ── Prepare input tensors ───────────────────────────────────────────────

    const personTensor = canvasToTensor(ort, input.person.agnosticCanvas, w, h);
    const clothTensor  = canvasToTensor(ort, input.garment.garmentCanvas, w, h);
    const maskTensor   = canvasMaskToTensor(ort, input.garment.garmentMaskCanvas, w, h);

    const feeds: Record<string, unknown> = {};
    const names = this.spec.inputNames;
    if (names[0]) feeds[names[0]] = personTensor;
    if (names[1]) feeds[names[1]] = clothTensor;
    if (names[2]) feeds[names[2]] = maskTensor;

    // ── Run inference ───────────────────────────────────────────────────────
    const results = await (this.session as { run: (feeds: Record<string, unknown>) => Promise<Record<string, unknown>> }).run(feeds);
    const outputTensor = results[this.spec.outputName] as { data: Float32Array; dims: number[] };

    if (!outputTensor) {
      throw new Error(`VTONInference: output tensor '${this.spec.outputName}' not found in model output`);
    }

    // ── Decode output ───────────────────────────────────────────────────────
    const resultCanvas = tensorToCanvas(outputTensor.data, w, h);
    const resultBitmap = await createImageBitmap(resultCanvas);

    const inferenceMs = performance.now() - t0;

    return {
      result: resultBitmap,
      inferenceMs: Math.round(inferenceMs),
      modelId: this.spec.id,
    };
  }

  dispose(): void {
    // onnxruntime-web InferenceSession has no explicit dispose in all versions,
    // but we clear the reference to allow GC.
    this.session = null;
    this.spec = null;
  }
}

export class ModelNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelNotFoundError';
  }
}

// ── Tensor conversion helpers ─────────────────────────────────────────────────

/**
 * Convert a canvas to a Float32 NCHW tensor, normalised to [-1, 1].
 * Shape: [1, 3, height, width]
 */
function canvasToTensor(
  ort: { Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown },
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
): unknown {
  const resized = resizeCanvas(canvas, w, h);
  const ctx = resized.getContext('2d')!;
  const { data } = ctx.getImageData(0, 0, w, h);

  const tensor = new Float32Array(3 * h * w);
  for (let i = 0; i < h * w; i++) {
    const r = data[i * 4]!;
    const g = data[i * 4 + 1]!;
    const b = data[i * 4 + 2]!;
    tensor[i]           = r / 127.5 - 1; // R channel
    tensor[h * w + i]   = g / 127.5 - 1; // G channel
    tensor[2 * h * w + i] = b / 127.5 - 1; // B channel
  }

  return new ort.Tensor('float32', tensor, [1, 3, h, w]);
}

/**
 * Convert a mask canvas to a Float32 NCHW tensor with values in [0, 1].
 * Shape: [1, 1, height, width]
 */
function canvasMaskToTensor(
  ort: { Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown },
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
): unknown {
  const resized = resizeCanvas(canvas, w, h);
  const ctx = resized.getContext('2d')!;
  const { data } = ctx.getImageData(0, 0, w, h);

  const tensor = new Float32Array(h * w);
  for (let i = 0; i < h * w; i++) {
    tensor[i] = data[i * 4]! / 255; // use R channel as mask value
  }

  return new ort.Tensor('float32', tensor, [1, 1, h, w]);
}

/**
 * Convert a Float32 NCHW tensor (range [-1, 1]) back to a canvas.
 * Shape expected: [1, 3, height, width]
 */
function tensorToCanvas(data: Float32Array, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(w, h);
  const pixels = imageData.data;

  for (let i = 0; i < h * w; i++) {
    const r = data[i]!;
    const g = data[h * w + i]!;
    const b = data[2 * h * w + i]!;
    pixels[i * 4]     = Math.round((r + 1) * 127.5);
    pixels[i * 4 + 1] = Math.round((g + 1) * 127.5);
    pixels[i * 4 + 2] = Math.round((b + 1) * 127.5);
    pixels[i * 4 + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function resizeCanvas(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const dst = document.createElement('canvas');
  dst.width = w;
  dst.height = h;
  const ctx = dst.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return dst;
}
