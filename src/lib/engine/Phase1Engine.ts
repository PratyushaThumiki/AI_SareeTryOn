import type { Product } from '@/lib/products/types';
import { getRegistry, type TryOnRenderer } from '@/lib/renderer';
import type { RenderInputs, RenderTarget } from '@/lib/renderer/types';
import type { EngineStatus, EngineStatusEvent, EngineStatusListener, TryOnEngine } from './types';

/**
 * Phase 1 TryOnEngine.
 *
 * Wraps the existing GarmentRegistry renderer (SareeRenderer or
 * MultiPartSareeRenderer). This is a PLACEHOLDER VISUALIZATION — it
 * composites flat garment images onto body regions using pose landmarks.
 * It does NOT produce realistic virtual draping.
 *
 * Phase 2 will replace this class with a neural garment synthesis engine.
 * Nothing outside this file and createEngine() needs to change when that
 * replacement happens.
 *
 * This class is intentionally not exported from the package barrel.
 * Callers always go through createEngine() in index.ts.
 */
export class Phase1Engine implements TryOnEngine {
  private renderer: TryOnRenderer | null = null;
  private _status: EngineStatus = 'idle';
  private listeners = new Set<EngineStatusListener>();
  private disposed = false;

  constructor(private readonly product: Product) {}

  get status(): EngineStatus {
    return this._status;
  }

  async init(product: Product, target: RenderTarget): Promise<void> {
    if (this.disposed) return;
    this.emit('loading');

    try {
      const renderer = getRegistry().create(product);
      await renderer.init(target);
      if (this.disposed) {
        renderer.dispose();
        return;
      }
      this.renderer = renderer;
      this.emit('ready');
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  draw(target: RenderTarget, inputs: RenderInputs): void {
    if (this._status !== 'ready' || !this.renderer) return;
    this.renderer.draw(target, inputs);
  }

  async requestTryOn(_snapshot: HTMLCanvasElement): Promise<void> {
    // Phase 1: no-op.
    // Phase 2 replaces this with: parse body map → neural inference → update result buffer.
  }

  get hasResult(): boolean { return false; }
  get canGenerate(): boolean { return false; }
  clearResult(): void { /* Phase 1 never produces a result */ }

  subscribe(listener: EngineStatusListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  dispose(): void {
    this.disposed = true;
    this.renderer?.dispose();
    this.renderer = null;
    this.listeners.clear();
    this._status = 'idle';
  }

  private emit(status: EngineStatus, error?: Error): void {
    this._status = status;
    const event: EngineStatusEvent = { status, ...(error ? { error } : {}) };
    this.listeners.forEach(l => l(event));
  }
}
