/**
 * CameraManager owns the MediaStream lifecycle and nothing else.
 *
 * Design constraints:
 *   * No frames leave this module. There is no encode / upload / persist
 *     helper anywhere on the CameraManager surface — auditors can grep
 *     for `toBlob|toDataURL|captureStream|createImageBitmap` in this
 *     directory and find nothing that ships pixels off-device.
 *   * Camera switching is atomic: we stop the old stream before we open
 *     the new one, to avoid the "two active cameras" browser bug on iOS.
 *   * The video element is attached externally so the CameraManager
 *     never has to know how the UI arranges DOM.
 */

export type FacingMode = 'user' | 'environment';

export interface CameraOptions {
  facing?: FacingMode;
  width?: number;
  height?: number;
  frameRate?: number;
}

export interface CameraStartResult {
  stream: MediaStream;
  facing: FacingMode;
  settings: MediaTrackSettings | null;
}

export class CameraDeniedError extends Error {
  constructor() {
    super('The user denied camera access.');
    this.name = 'CameraDeniedError';
  }
}

export class NoCameraError extends Error {
  constructor() {
    super('No camera device is available on this system.');
    this.name = 'NoCameraError';
  }
}

export class CameraManager {
  private stream: MediaStream | null = null;
  private facing: FacingMode = 'user';

  async start(opts: CameraOptions = {}): Promise<CameraStartResult> {
    await this.stop();
    this.facing = opts.facing ?? 'user';

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        facingMode: { ideal: this.facing },
        width: { ideal: opts.width ?? 960 },
        height: { ideal: opts.height ?? 720 },
        frameRate: { ideal: opts.frameRate ?? 30 },
      },
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      const e = err as DOMException;
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
        throw new CameraDeniedError();
      }
      if (e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')) {
        throw new NoCameraError();
      }
      throw err;
    }

    this.stream = stream;

    const track = stream.getVideoTracks()[0];
    const settings = track ? track.getSettings() : null;

    return { stream, facing: this.facing, settings };
  }

  async switchFacing(): Promise<CameraStartResult> {
    const next: FacingMode = this.facing === 'user' ? 'environment' : 'user';
    return this.start({ facing: next });
  }

  async stop(): Promise<void> {
    if (!this.stream) return;
    for (const t of this.stream.getTracks()) {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    }
    this.stream = null;
  }

  isRunning(): boolean {
    return !!this.stream && this.stream.getTracks().some((t) => t.readyState === 'live');
  }

  currentFacing(): FacingMode {
    return this.facing;
  }
}
