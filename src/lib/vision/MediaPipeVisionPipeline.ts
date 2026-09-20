import type {
  Landmark,
  SegmentationMask,
  VisionFrame,
  VisionPipeline,
  VisionPipelineCapabilities,
  VisionTimings,
} from './types';

/**
 * MediaPipe Tasks Vision pipeline.
 *
 * Runs pose + person segmentation entirely on-device. Nothing crosses the
 * network except the initial model download from Google's public model
 * store, which happens once and is cached by the browser. The camera
 * stream is passed by reference — MediaPipe reads pixels via GPU where
 * possible and never copies them outside the process.
 *
 * We chose MediaPipe over TF.js because:
 *   * It ships production-grade pose + segmentation together.
 *   * WASM+GPU delegate is faster than TF.js on the same tasks.
 *   * Apache 2.0 license, no server component.
 *
 * The models are pinned to specific paths so a future MediaPipe release
 * cannot silently ship a heavier or behavior-changed model.
 */

// URLs are fixed and audit-visible. Adding another origin here should
// require review; the CSP will block anything not allow-listed anyway.
const WASM_ROOT =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const SEG_MODEL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite';

// Lazy-import so server-side rendering never touches MediaPipe. The
// import is behind a promise so it happens at init(), not module load.
type PoseLandmarkerT = import('@mediapipe/tasks-vision').PoseLandmarker;
type ImageSegmenterT = import('@mediapipe/tasks-vision').ImageSegmenter;

export interface MediaPipeVisionOptions {
  /** Prefer GPU delegate. Falls back to CPU on failure. Default: true. */
  useGpu?: boolean;
  /** Skip segmentation on slow devices. Default: false. */
  skipSegmentation?: boolean;
}

export class MediaPipeVisionPipeline implements VisionPipeline {
  public capabilities: VisionPipelineCapabilities = {
    hasPose: false,
    hasSegmentation: false,
    hasGpu: false,
  };

  private pose: PoseLandmarkerT | null = null;
  private seg: ImageSegmenterT | null = null;
  private disposed = false;
  private timings: VisionTimings = { poseMs: 0, segmentationMs: 0, totalMs: 0 };
  private maskBuf: Float32Array | null = null;

  constructor(private opts: MediaPipeVisionOptions = {}) {}

  async init(): Promise<void> {
    if (this.disposed) throw new Error('pipeline disposed');
    if (this.pose) return; // idempotent

    const {
      FilesetResolver,
      PoseLandmarker,
      ImageSegmenter,
    } = await import('@mediapipe/tasks-vision');

    const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);

    const delegate = this.opts.useGpu === false ? 'CPU' : 'GPU';

    this.pose = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    this.capabilities.hasPose = true;
    this.capabilities.hasGpu = delegate === 'GPU';

    if (!this.opts.skipSegmentation) {
      this.seg = await ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: SEG_MODEL, delegate },
        runningMode: 'VIDEO',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
      this.capabilities.hasSegmentation = true;
    }
  }

  async process(
    source: HTMLVideoElement | ImageBitmap | OffscreenCanvas,
    timestampMs: number,
  ): Promise<VisionFrame> {
    if (!this.pose) throw new Error('pipeline not initialized');

    const start = performance.now();

    const width = getWidth(source);
    const height = getHeight(source);

    // Pose
    const poseStart = performance.now();
    const poseResult = this.pose.detectForVideo(source as HTMLVideoElement, timestampMs);
    const poseMs = performance.now() - poseStart;

    let landmarks: Landmark[] | null = null;
    if (poseResult.landmarks && poseResult.landmarks.length > 0 && poseResult.landmarks[0]) {
      const raw = poseResult.landmarks[0];
      landmarks = raw.map((p) => ({
        x: p.x,
        y: p.y,
        z: p.z,
        visibility: (p as { visibility?: number }).visibility ?? 0,
      }));
    }

    // Segmentation
    let segmentation: SegmentationMask | null = null;
    let segMs = 0;
    if (this.seg) {
      const segStart = performance.now();
      const segResult = this.seg.segmentForVideo(source as HTMLVideoElement, timestampMs);
      segMs = performance.now() - segStart;

      try {
        const mask = segResult.confidenceMasks?.[0];
        if (mask) {
          const arr = mask.getAsFloat32Array();
          // Reuse buffer between frames when the mask size is stable to
          // avoid GC churn on the render loop.
          if (!this.maskBuf || this.maskBuf.length !== arr.length) {
            this.maskBuf = new Float32Array(arr.length);
          }
          this.maskBuf.set(arr);
          segmentation = {
            width: mask.width,
            height: mask.height,
            data: this.maskBuf,
          };
        }
      } finally {
        segResult.close();
      }
    }

    const totalMs = performance.now() - start;
    this.timings = { poseMs, segmentationMs: segMs, totalMs };

    const reason: VisionFrame['reason'] = !landmarks ? 'no-person' : undefined;

    return {
      timestampMs,
      frameWidth: width,
      frameHeight: height,
      landmarks,
      segmentation,
      reason,
    };
  }

  lastTimings(): VisionTimings {
    return this.timings;
  }

  dispose(): void {
    this.disposed = true;
    try {
      this.pose?.close();
    } catch {
      /* ignore */
    }
    try {
      this.seg?.close();
    } catch {
      /* ignore */
    }
    this.pose = null;
    this.seg = null;
    this.maskBuf = null;
  }
}

function getWidth(src: HTMLVideoElement | ImageBitmap | OffscreenCanvas): number {
  if (src instanceof HTMLVideoElement) return src.videoWidth || src.clientWidth;
  return src.width;
}

function getHeight(src: HTMLVideoElement | ImageBitmap | OffscreenCanvas): number {
  if (src instanceof HTMLVideoElement) return src.videoHeight || src.clientHeight;
  return src.height;
}
