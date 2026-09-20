import type { Product, SareeTryOnAssets } from '@/lib/products/types';
import type { RenderInputs, RenderTarget } from '@/lib/renderer/types';
import { SareeAssetProcessor } from '@/lib/vton/SareeAssetProcessor';
import { PersonPreprocessor } from '@/lib/vton/PersonPreprocessor';
import { VTONInference, ModelNotFoundError } from '@/lib/vton/VTONInference';
import { DM_VTON_SPEC } from '@/lib/vton/types';
import type { ConditionedGarment } from '@/lib/vton/types';
import { Phase1Engine } from './Phase1Engine';
import type { EngineStatus, EngineStatusEvent, EngineStatusListener, TryOnEngine } from './types';

/**
 * Phase2VTONEngine
 *
 * The neural virtual try-on engine. Replaces Phase1Engine as the active
 * implementation when the ONNX model weights are present.
 *
 * State machine:
 *
 *   idle
 *    ↓ init()
 *   loading  ←── model weights downloading / preprocessing setup
 *    ↓ model loaded
 *   ready    ←── live Phase1 preview active; waiting for requestTryOn()
 *    ↓ requestTryOn(snapshot)
 *   generating ←── on-device ONNX inference running
 *    ↓ inference complete
 *   result   ←── generated image displayed
 *    ↓ clearResult()
 *   ready
 *
 *   Any state → error (on unrecoverable failure)
 *
 * FALLBACK:
 *   When the model file is missing (ModelNotFoundError during init),
 *   status transitions to 'ready' with canGenerate=false. draw() delegates
 *   to Phase1Engine so the live preview remains fully functional.
 *   The user is never left with a broken camera.
 *
 * PRIVACY:
 *   All inference runs in the browser via onnxruntime-web (WebAssembly).
 *   The person snapshot and all intermediate tensors stay in browser memory.
 *   Nothing is uploaded. dispose() clears all image references.
 */
export class Phase2VTONEngine implements TryOnEngine {
  private _status: EngineStatus = 'idle';
  private listeners = new Set<EngineStatusListener>();
  private disposed = false;

  // Phase1 engine for live preview — always running, used as fallback.
  private previewEngine: Phase1Engine;

  // VTON pipeline components.
  private garmentProcessor = new SareeAssetProcessor();
  private personProcessor = new PersonPreprocessor();
  private inference = new VTONInference();

  // Pre-computed garment conditioning (loaded once on init).
  private conditionedGarment: ConditionedGarment | null = null;

  // The most recent generated result, drawn when status === 'result'.
  private resultBitmap: ImageBitmap | null = null;

  // The latest vision frame, cached from draw() for use in requestTryOn().
  private lastVisionInputs: RenderInputs | null = null;

  // Whether the neural model loaded successfully.
  private modelReady = false;

  constructor(private readonly product: Product) {
    this.previewEngine = new Phase1Engine(product);
  }

  get status(): EngineStatus { return this._status; }
  get hasResult(): boolean { return this._status === 'result'; }
  get canGenerate(): boolean { return this.modelReady; }

  async init(product: Product, target: RenderTarget): Promise<void> {
    if (this.disposed) return;
    this.emit('loading');

    // Always init the Phase1 preview engine so live preview works immediately.
    await this.previewEngine.init(product, target);

    // Pre-process garment conditioning in parallel with model loading.
    const tryOnAssets = product.tryOnAssets as SareeTryOnAssets;
    let garmentReady = false;

    if (tryOnAssets.parts) {
      try {
        this.conditionedGarment = await this.garmentProcessor.process(tryOnAssets);
        garmentReady = true;
      } catch (err) {
        // Garment conditioning failure is non-fatal — inference won't run
        // but live preview continues.
        console.warn('[Phase2VTONEngine] Garment conditioning failed:', err);
      }
    }

    // Load the ONNX model.
    try {
      await this.inference.loadModel(DM_VTON_SPEC);
      this.modelReady = true;
      if (!this.disposed) this.emit('ready');
    } catch (err) {
      if (err instanceof ModelNotFoundError) {
        // Expected: weights are optional during development. The live preview
        // is ready, but generation stays disabled until weights exist.
        console.info(
          '[Phase2VTONEngine] VTON model not found — neural generation unavailable.\n' +
          'Live preview (Phase 1) is active. To enable neural try-on:\n' +
          '  1. Run experiments/mobile-vton/scripts/06_export_dm_vton_onnx.py\n' +
          `  2. Place the output at public${DM_VTON_SPEC.path}\n` +
          '  3. Restart the dev server.'
        );
        if (!this.disposed) this.emit('ready');
        void garmentReady; // suppress unused warning
      } else {
        if (!this.disposed) {
          this.emit('error', err instanceof Error ? err : new Error(String(err)));
        }
      }
    }
  }

  draw(target: RenderTarget, inputs: RenderInputs): void {
    // Cache the latest inputs for requestTryOn().
    this.lastVisionInputs = inputs;

    if (this._status === 'result' && this.resultBitmap) {
      // Display the generated try-on result.
      drawBitmapContain(target, this.resultBitmap);
      return;
    }

    // For all other states: live Phase1 preview.
    if (this.previewEngine.status === 'ready') {
      this.previewEngine.draw(target, inputs);
    } else {
      // Phase1 not yet ready — draw raw video.
      const { ctx, width, height, mirrored } = target;
      ctx.save();
      ctx.clearRect(0, 0, width, height);
      if (mirrored) { ctx.translate(width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(inputs.video, 0, 0, width, height);
      ctx.restore();
    }
  }

  async requestTryOn(snapshot: HTMLCanvasElement): Promise<void> {
    if (this.disposed) return;
    if (!this.modelReady) {
      console.warn(
        '[Phase2VTONEngine] requestTryOn() called but neural model is not loaded. ' +
        'See console for instructions to install model weights.'
      );
      return;
    }
    if (!this.conditionedGarment) {
      console.warn('[Phase2VTONEngine] requestTryOn() called but garment conditioning failed.');
      return;
    }
    if (this._status === 'generating') return; // already running

    this.emit('generating');

    const prevResult = this.resultBitmap;

    try {
      const personCondition = this.personProcessor.process(
        snapshot,
        this.lastVisionInputs?.vision ?? null,
        DM_VTON_SPEC.inputWidth,
        DM_VTON_SPEC.inputHeight,
      );

      const output = await this.inference.infer({
        person: personCondition,
        garment: this.conditionedGarment,
        outputWidth: DM_VTON_SPEC.inputWidth,
        outputHeight: DM_VTON_SPEC.inputHeight,
      });

      // Free the previous result bitmap.
      prevResult?.close();
      this.resultBitmap = output.result;

      console.info(
        `[Phase2VTONEngine] Generation complete. Model: ${output.modelId}, ` +
        `inference: ${output.inferenceMs}ms`
      );

      if (!this.disposed) this.emit('result');
    } catch (err) {
      console.error('[Phase2VTONEngine] Inference failed:', err);
      // Revert to ready (live preview) rather than entering permanent error state,
      // since the camera and Phase1 preview are still working.
      if (!this.disposed) this.emit('ready');
    }
  }

  clearResult(): void {
    if (this._status !== 'result') return;
    this.resultBitmap?.close();
    this.resultBitmap = null;
    this.emit('ready');
  }

  subscribe(listener: EngineStatusListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  dispose(): void {
    this.disposed = true;
    this.previewEngine.dispose();
    this.inference.dispose();
    this.resultBitmap?.close();
    this.resultBitmap = null;
    this.conditionedGarment = null;
    this.lastVisionInputs = null;
    this.listeners.clear();
    this._status = 'idle';
  }

  private emit(status: EngineStatus, error?: Error): void {
    this._status = status;
    const event: EngineStatusEvent = { status, ...(error ? { error } : {}) };
    this.listeners.forEach(l => l(event));
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Draw an ImageBitmap onto the canvas, scaled to contain (letterbox).
 * Preserves the generated result aspect ratio; fills with black bars.
 */
function drawBitmapContain(target: RenderTarget, bitmap: ImageBitmap): void {
  const { ctx, width, height } = target;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  const scale = Math.min(width / bitmap.width, height / bitmap.height);
  const sw = bitmap.width * scale;
  const sh = bitmap.height * scale;
  const ox = (width - sw) / 2;
  const oy = (height - sh) / 2;
  ctx.drawImage(bitmap, ox, oy, sw, sh);
  ctx.restore();
}
