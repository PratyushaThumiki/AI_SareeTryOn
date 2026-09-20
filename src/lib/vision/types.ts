/**
 * Vision pipeline types.
 *
 * The pipeline's job is to turn a frame of camera video into a
 * `VisionFrame` — normalized landmarks + a person-vs-background mask.
 * Consumers (renderers, debug panels) depend ONLY on this file.
 *
 * Coordinates in `Landmark` are in the [0..1] space of the source frame:
 *   x — left→right, y — top→bottom, z — depth (smaller = closer),
 *   visibility — [0..1] confidence.
 */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

/**
 * The 33 landmarks emitted by MediaPipe Pose. Enumerated so higher layers
 * can name them without depending on MediaPipe's own enum.
 */
export const POSE_LANDMARK = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export type PoseLandmarkIndex = (typeof POSE_LANDMARK)[keyof typeof POSE_LANDMARK];

export interface SegmentationMask {
  /** Same width/height as the frame we processed. */
  width: number;
  height: number;
  /**
   * Row-major mask, values in [0..1]. 1 = fully person, 0 = background.
   * Consumers should treat this as read-only; the pipeline may reuse the
   * same buffer between frames for performance.
   */
  data: Float32Array;
}

export interface VisionFrame {
  timestampMs: number;
  frameWidth: number;
  frameHeight: number;
  landmarks: Landmark[] | null;
  segmentation: SegmentationMask | null;
  /**
   * If populated, the pipeline is running but did not produce a stable
   * result for this frame (e.g. no person detected). Renderers should
   * fall back to hiding the garment rather than freezing on stale data.
   */
  reason?: 'no-person' | 'low-confidence' | 'model-loading';
}

/** Diagnostic timings for the FPS/latency panel. */
export interface VisionTimings {
  poseMs: number;
  segmentationMs: number;
  totalMs: number;
}

export interface VisionPipelineCapabilities {
  hasPose: boolean;
  hasSegmentation: boolean;
  hasGpu: boolean;
}

/**
 * Vision pipeline contract. Every implementation MUST:
 *   1. Run entirely on-device.
 *   2. Never call fetch() with camera data.
 *   3. Never persist frames.
 *   4. Support process() from either an HTMLVideoElement or an
 *      ImageBitmap so callers can decouple decode from inference.
 */
export interface VisionPipeline {
  readonly capabilities: VisionPipelineCapabilities;
  init(): Promise<void>;
  process(
    source: HTMLVideoElement | ImageBitmap | OffscreenCanvas,
    timestampMs: number,
  ): Promise<VisionFrame>;
  lastTimings(): VisionTimings;
  dispose(): void;
}
