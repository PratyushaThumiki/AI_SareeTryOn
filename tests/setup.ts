import { vi, beforeAll } from 'vitest';

// Suppress jsdom's "Not implemented: HTMLCanvasElement.prototype.getContext"
// console.error noise. The canvas stubs return null which is the correct
// behaviour for our feature-detection logic.
beforeAll(() => {
  const orig = console.error.bind(console);
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const msg = String(args[0] ?? '');
    if (msg.includes('Not implemented') || msg.includes('HTMLCanvasElement')) return;
    orig(...args);
  });
});

// Provide a minimal MediaDevices stub so CameraManager tests can run in
// jsdom without a real camera.
if (!globalThis.navigator.mediaDevices) {
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    writable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn(), readyState: 'live' }],
        getVideoTracks: () => [{ stop: vi.fn(), readyState: 'live', getSettings: () => ({}) }],
      }),
    },
  });
}

// Provide an OffscreenCanvas stub (jsdom doesn't include it).
if (typeof globalThis.OffscreenCanvas === 'undefined') {
  (globalThis as Record<string, unknown>)['OffscreenCanvas'] = class OffscreenCanvas {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext() { return null; }
  };
}
