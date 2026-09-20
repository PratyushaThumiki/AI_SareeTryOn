/**
 * Feature-detects whether the current browser can run the on-device vision
 * pipeline. Never uploads anything. Called before we prompt for camera
 * permission so we can show a graceful fallback instead of silently
 * degrading privacy.
 */
export interface DeviceCapability {
  hasCamera: boolean;
  hasWasm: boolean;
  hasWebGL: boolean;
  hasWebGPU: boolean;
  hasOffscreenCanvas: boolean;
  isSecureContext: boolean;
  isMobileUA: boolean;
}

export function detectCapabilities(): DeviceCapability {
  if (typeof window === 'undefined') {
    return {
      hasCamera: false,
      hasWasm: false,
      hasWebGL: false,
      hasWebGPU: false,
      hasOffscreenCanvas: false,
      isSecureContext: false,
      isMobileUA: false,
    };
  }

  const hasCamera = Boolean(
    navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function',
  );

  const hasWasm = typeof WebAssembly !== 'undefined';

  let hasWebGL = false;
  try {
    const c = document.createElement('canvas');
    hasWebGL = Boolean(
      c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'),
    );
  } catch {
    hasWebGL = false;
  }

  // `gpu` is present on WebGPU-capable browsers. We don't actually request
  // an adapter here — that would prompt in some UAs — just detect the API.
  const hasWebGPU = 'gpu' in navigator;

  const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';

  const isSecureContext = window.isSecureContext === true;

  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/.test(navigator.userAgent);

  return {
    hasCamera,
    hasWasm,
    hasWebGL,
    hasWebGPU,
    hasOffscreenCanvas,
    isSecureContext,
    isMobileUA,
  };
}

export function canRunOnDeviceVision(cap: DeviceCapability): boolean {
  // Non-negotiables: WASM for MediaPipe, camera for input, secure context
  // for getUserMedia (except on localhost, which browsers exempt).
  return cap.hasWasm && cap.hasCamera && cap.isSecureContext;
}
