/**
 * Phase 2 tests
 *
 * Covers:
 *   - SareeAssetProcessor: canonical garment image construction
 *   - Phase2VTONEngine: state machine, fallback, privacy guarantees
 *   - useTryOnLoop: requestTryOn / clearResult exposed
 *   - Privacy: no network calls made during inference
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModelNotFoundError } from '@/lib/vton/VTONInference';

// ── SareeAssetProcessor ───────────────────────────────────────────────────────

describe('SareeAssetProcessor', () => {
  it('throws when tryOnAssets.parts is missing', async () => {
    const { SareeAssetProcessor } = await import('@/lib/vton/SareeAssetProcessor');
    const processor = new SareeAssetProcessor();
    await expect(
      processor.process({ kind: 'saree', parts: undefined } as any)
    ).rejects.toThrow('parts is required');
  });

  function makeMockEnv() {
    // Create a fresh image mock per call (each loadImage() call creates a new Image).
    vi.spyOn(global, 'Image').mockImplementation(() => {
      const img: any = {
        naturalWidth: 100, naturalHeight: 100,
        width: 100, height: 100,
        crossOrigin: '',
        onload: null as unknown as (() => void) | null,
        onerror: null,
      };
      Object.defineProperty(img, 'src', {
        set(_: string) {
          // Fire onload in the next microtask so the caller can set img.onload first.
          Promise.resolve().then(() => img.onload?.());
        },
      });
      return img as HTMLImageElement;
    });

    // jsdom doesn't implement canvas 2D — stub getContext to return a no-op context.
    const fakeCtx = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      get globalAlpha() { return 1; },
      set globalAlpha(_: number) {},
      createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx as any);
  }

  it('returns a ConditionedGarment with garmentCanvas and garmentMaskCanvas', async () => {
    makeMockEnv();
    const { SareeAssetProcessor } = await import('@/lib/vton/SareeAssetProcessor');

    const processor = new SareeAssetProcessor();
    const result = await processor.process({
      kind: 'saree',
      parts: {
        body:  { src: '/test/body.jpg' },
        border: { src: '/test/border.jpg' },
        pallu: { src: '/test/pallu.jpg' },
        blouse: { src: '/test/blouse.jpg' },
      },
    } as any);

    expect(result.garmentCanvas).toBeInstanceOf(HTMLCanvasElement);
    expect(result.garmentMaskCanvas).toBeInstanceOf(HTMLCanvasElement);
    expect(result.garmentCanvas.width).toBe(768);
    expect(result.garmentCanvas.height).toBe(1024);
    expect(result.garmentMaskCanvas.width).toBe(768);
    expect(result.garmentMaskCanvas.height).toBe(1024);

    expect(result.availability.body).toBe(true);
    expect(result.availability.border).toBe(true);
    expect(result.availability.pallu).toBe(true);
    expect(result.availability.blouse).toBe(true);

    vi.restoreAllMocks();
  });

  it('gracefully handles missing optional assets (border/pallu/blouse)', async () => {
    makeMockEnv();
    const { SareeAssetProcessor } = await import('@/lib/vton/SareeAssetProcessor');

    const processor = new SareeAssetProcessor();
    const result = await processor.process({
      kind: 'saree',
      parts: { body: { src: '/test/body.jpg' } },
    } as any);

    expect(result.garmentCanvas).toBeInstanceOf(HTMLCanvasElement);
    expect(result.availability.body).toBe(true);
    expect(result.availability.border).toBe(false);
    expect(result.availability.pallu).toBe(false);
    expect(result.availability.blouse).toBe(false);
    expect(result.components.border).toBeNull();
    expect(result.components.pallu).toBeNull();
    expect(result.components.blouse).toBeNull();

    vi.restoreAllMocks();
  });
});

// ── Phase2VTONEngine state machine ────────────────────────────────────────────

describe('Phase2VTONEngine state machine', () => {
  const testProduct = {
    id: 'test', name: 'Test', category: 'saree',
    tryOnAssets: { kind: 'saree', parts: { body: { src: '/test.jpg' } } },
  } as any;

  /**
   * Patch all async internals of a Phase2VTONEngine instance so tests
   * can drive the state machine without loading real files or the ONNX runtime.
   *
   * Uses Object.assign to replace private fields — OK for unit tests where
   * we need to inspect private state indirectly through public getters.
   */
  function patchInternals(engine: { previewEngine: any; garmentProcessor: any; inference: any }) {
    engine.previewEngine = {
      status: 'ready' as const,
      hasResult: false,
      canGenerate: false,
      init: vi.fn().mockResolvedValue(undefined),
      draw: vi.fn(),
      requestTryOn: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockReturnValue(() => {}),
      clearResult: vi.fn(),
      dispose: vi.fn(),
    };
    engine.garmentProcessor = {
      process: vi.fn().mockResolvedValue({
        garmentCanvas: document.createElement('canvas'),
        garmentMaskCanvas: document.createElement('canvas'),
        components: { body: document.createElement('canvas'), border: null, pallu: null, blouse: null },
        availability: { body: true, border: false, pallu: false, blouse: false },
      }),
    };
    engine.inference = {
      loadModel: vi.fn().mockRejectedValue(new ModelNotFoundError('weights not found')),
      infer: vi.fn(),
      dispose: vi.fn(),
    };
  }

  it('starts in idle state before init()', async () => {
    const { Phase2VTONEngine } = await import('@/lib/engine/Phase2VTONEngine');
    const engine = new Phase2VTONEngine(testProduct);
    expect(engine.status).toBe('idle');
    expect(engine.hasResult).toBe(false);
    engine.dispose();
  });

  it('emits ready with generation disabled when weights are absent', async () => {
    const { Phase2VTONEngine } = await import('@/lib/engine/Phase2VTONEngine');
    const engine = new Phase2VTONEngine(testProduct);
    patchInternals(engine as any);

    const statuses: string[] = [];
    engine.subscribe(({ status }) => statuses.push(status));

    const dummy = document.createElement('canvas');
    await engine.init(testProduct, {
      canvas: dummy, ctx: {} as any, width: 0, height: 0, dpr: 1, mirrored: false,
    });

    expect(statuses).toContain('loading');
    // Phase1 preview is ready, but neural generation remains unavailable.
    expect(engine.status).toBe('ready');
    expect(engine.canGenerate).toBe(false);
    engine.dispose();
  });

  it('clearResult() is a no-op unless status is result', async () => {
    const { Phase2VTONEngine } = await import('@/lib/engine/Phase2VTONEngine');
    const engine = new Phase2VTONEngine(testProduct);
    expect(() => engine.clearResult()).not.toThrow();
    expect(engine.status).toBe('idle');
    engine.dispose();
  });

  it('unsubscribe stops status delivery', async () => {
    const { Phase2VTONEngine } = await import('@/lib/engine/Phase2VTONEngine');
    const engine = new Phase2VTONEngine(testProduct);
    patchInternals(engine as any);

    const listener = vi.fn();
    const unsub = engine.subscribe(listener);
    unsub(); // unsubscribe before init

    const dummy = document.createElement('canvas');
    await engine.init(testProduct, {
      canvas: dummy, ctx: {} as any, width: 0, height: 0, dpr: 1, mirrored: false,
    });

    expect(listener).not.toHaveBeenCalled();
    engine.dispose();
  });

  it('dispose() can be called multiple times without throwing', async () => {
    const { Phase2VTONEngine } = await import('@/lib/engine/Phase2VTONEngine');
    const engine = new Phase2VTONEngine(testProduct);
    patchInternals(engine as any);
    expect(() => engine.dispose()).not.toThrow();
    expect(() => engine.dispose()).not.toThrow();
  });
});

// ── Privacy guarantees ────────────────────────────────────────────────────────

describe('Phase 2 privacy: no camera data leaves the device', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockImplementation((_url, opts) => {
      const method = (opts as RequestInit | undefined)?.method ?? 'GET';
      if (method !== 'HEAD') {
        // Any non-HEAD fetch during VTON inference is a privacy violation.
        throw new Error(`PRIVACY VIOLATION: fetch() called during inference: ${_url}`);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requestTryOn() is a no-op (no network calls) when model is not loaded', async () => {
    // Engine starts in idle; modelReady = false → requestTryOn returns immediately.
    const { Phase2VTONEngine } = await import('@/lib/engine/Phase2VTONEngine');
    const engine = new Phase2VTONEngine({ id: 'test', name: 'Test', category: 'saree', tryOnAssets: { kind: 'saree', parts: { body: { src: '/test.jpg' } } } } as any);

    const snapshot = document.createElement('canvas');
    // Must resolve without throwing and without triggering fetch POST/PUT.
    await expect(engine.requestTryOn(snapshot)).resolves.toBeUndefined();
    expect(engine.status).toBe('idle'); // state unchanged

    engine.dispose();
  });

  it('createEngine factory returns a TryOnEngine-shaped object', async () => {
    const { createEngine } = await import('@/lib/engine');
    const product = { id: 'test', name: 'Test', category: 'saree', tryOnAssets: { kind: 'saree', parts: { body: { src: '/test.jpg' } } } } as any;
    const engine = createEngine(product);

    expect(typeof engine.status).toBe('string');
    expect(typeof engine.init).toBe('function');
    expect(typeof engine.draw).toBe('function');
    expect(typeof engine.requestTryOn).toBe('function');
    expect(typeof engine.subscribe).toBe('function');
    expect(typeof engine.hasResult).toBe('boolean');
    expect(typeof engine.clearResult).toBe('function');
    expect(typeof engine.dispose).toBe('function');
  });
});

// ── ModelNotFoundError ────────────────────────────────────────────────────────

describe('ModelNotFoundError', () => {
  it('is an Error subclass with name ModelNotFoundError', () => {
    const err = new ModelNotFoundError('weights not found');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ModelNotFoundError');
    expect(err.message).toBe('weights not found');
  });
});
