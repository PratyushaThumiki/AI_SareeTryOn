import type { Product } from '@/lib/products/types';
import type { RenderInputs, RenderTarget } from '@/lib/renderer/types';

/**
 * Lifecycle states for a TryOnEngine.
 *
 * Phase 1 engines transition: idle → loading → ready (quickly, just image loads).
 * Phase 2 engines may stay in 'loading' for seconds while model weights initialise,
 * then enter 'generating' each time requestTryOn() is called.
 */
export type EngineStatus =
  | 'idle'        // created, init() not yet called
  | 'loading'     // init() in progress (model weights, preprocessing setup)
  | 'ready'       // initialised, live preview active, no generated result
  | 'generating'  // async inference in progress (Phase 2+)
  | 'result'      // generated result available and being displayed
  | 'error';      // init or inference failed — check EngineStatusEvent.error

export interface EngineStatusEvent {
  status: EngineStatus;
  /** Set when status === 'error'. */
  error?: Error;
}

export type EngineStatusListener = (event: EngineStatusEvent) => void;

/**
 * TryOnEngine — the contract between the try-on loop and the synthesis layer.
 *
 * Phase 1 engines implement this with a canvas overlay renderer.
 * Phase 2 engines implement this with a neural garment synthesis model.
 *
 * The interface is deliberately designed so that:
 *   - draw() is always synchronous (runs inside requestAnimationFrame — cannot await)
 *   - requestTryOn() is async (can take 5–30s for neural inference in Phase 2)
 *   - status is always synchronously readable
 *   - subscribe() enables the UI to react to status changes without polling
 *
 * Phase 2 replacement contract:
 *   CameraStream, BodyTracker, TryOnSession, ProductData, useTryOnLoop, and
 *   TryOnScreen do NOT need to change when this interface is re-implemented.
 *   Only createEngine() in index.ts needs to return the new implementation.
 */
export interface TryOnEngine {
  /** Synchronously readable current status. */
  readonly status: EngineStatus;

  /**
   * Load all resources needed to render.
   *
   * Phase 1: decodes garment images (~50ms).
   * Phase 2: downloads and initialises neural model weights (seconds to minutes).
   *
   * Must be called once before draw(). Safe to call with a dummy target if the
   * real canvas is not yet mounted — the engine pre-loads assets independently.
   */
  init(product: Product, target: RenderTarget): Promise<void>;

  /**
   * Draw the current try-on result to the canvas.
   *
   * Called synchronously on every animation frame. MUST NOT await anything.
   *
   * Phase 1: draws an immediate canvas overlay.
   * Phase 2: draws the most recently completed generated result (or a live
   *   body-region hint while generation is in progress). Never blocks.
   */
  draw(target: RenderTarget, inputs: RenderInputs): void;

  /**
   * Request a try-on generation pass from the provided snapshot canvas.
   *
   * Phase 1: no-op — resolves immediately.
   * Phase 2: captures a frame, runs full neural inference on-device, updates
   *   the internal result buffer, fires status events:
   *   'ready' → 'generating' → 'ready'  (or 'error' on failure)
   *
   * The snapshot canvas is the caller's responsibility — it must contain
   * a valid captured frame at the moment this is called.
   * The engine MUST NOT upload snapshot data anywhere.
   */
  requestTryOn(snapshot: HTMLCanvasElement): Promise<void>;

  /**
   * Subscribe to status changes.
   * Returns an unsubscribe function — call it on cleanup.
   */
  subscribe(listener: EngineStatusListener): () => void;

  /**
   * True when status === 'result' and a generated image is being displayed.
   * False in all other states — live preview is shown instead.
   */
  readonly hasResult: boolean;

  /** Whether a neural generation request can be fulfilled. */
  readonly canGenerate: boolean;

  /**
   * Discard the current generated result and return to live preview.
   * Transitions status: 'result' → 'ready'. No-op in other states.
   */
  clearResult(): void;

  /**
   * Release all held resources: image references, model weights, canvas buffers.
   * After dispose(), no other methods may be called.
   */
  dispose(): void;
}
