/**
 * Types for the VTON inference pipeline.
 *
 * Separation of concerns:
 *   SareeAssetProcessor  → ConditionedGarment
 *   PersonPreprocessor   → PersonCondition
 *   VTONInference        → VTONInput → VTONOutput
 *   Phase2VTONEngine     → orchestrates all of the above
 */

/** Garment conditioning produced by SareeAssetProcessor. */
export interface ConditionedGarment {
  /**
   * Primary garment image fed to the VTON model.
   *
   * For models accepting one flat-lay image: a canonical saree composition
   * where body fabric fills the background, border appears at the hem,
   * and pallu is positioned at the top-right — matching how a saree looks
   * when displayed, not a grid.
   *
   * For upper-body-only models (e.g. DM-VTON): the blouse piece.
   */
  garmentCanvas: HTMLCanvasElement;

  /**
   * Binary mask of the garment canvas — white where fabric exists.
   * Used by models that require a separate cloth mask input.
   */
  garmentMaskCanvas: HTMLCanvasElement;

  /** The individual component canvases, preserved for multi-channel conditioning. */
  components: {
    body: HTMLCanvasElement;
    border: HTMLCanvasElement | null;
    pallu: HTMLCanvasElement | null;
    blouse: HTMLCanvasElement | null;
  };

  /** Whether each component was successfully loaded. */
  availability: {
    body: boolean;
    border: boolean;
    pallu: boolean;
    blouse: boolean;
  };
}

/** Person conditioning produced by PersonPreprocessor. */
export interface PersonCondition {
  /**
   * The captured person frame, resized to model input dimensions.
   * Raw pixels — NEVER sent over the network.
   */
  personCanvas: HTMLCanvasElement;

  /**
   * Clothing-agnostic mask: the person image with the current clothing region
   * erased. The model inpaints this region with the new garment.
   *
   * Quality: approximated from MediaPipe pose landmarks (torso bounding region).
   * Real-quality would require SCHP human parser — not available in browser.
   */
  agnosticCanvas: HTMLCanvasElement;

  /**
   * Pose visualisation canvas: skeleton drawn on a black background.
   * Used by models that accept an explicit pose conditioning input.
   */
  poseCanvas: HTMLCanvasElement;

  /** Whether high-quality human parsing was available (SCHP). Always false in browser. */
  hasFullParsing: boolean;

  /** Whether DensePose UV map was available. Always false in browser. */
  hasDensePose: boolean;
}

/** Combined input to the VTON inference engine. */
export interface VTONInput {
  person: PersonCondition;
  garment: ConditionedGarment;
  /** Target output dimensions. */
  outputWidth: number;
  outputHeight: number;
}

/** Output from the VTON inference engine. */
export interface VTONOutput {
  /** Generated try-on image as an ImageBitmap — GPU-backed, efficient to draw. */
  result: ImageBitmap;
  /** Inference time in milliseconds. */
  inferenceMs: number;
  /** Model identifier that produced this result. */
  modelId: string;
}

/** Specification of the ONNX model to load and how to use it. */
export interface VTONModelSpec {
  /** Path to the .onnx file, relative to the document root (e.g. '/models/dm-vton.onnx'). */
  path: string;
  /** Human-readable model identifier. */
  id: string;
  /** Width expected by the model (pixels). */
  inputWidth: number;
  /** Height expected by the model (pixels). */
  inputHeight: number;
  /**
   * Whether this model requires a densepose input tensor.
   * If true and densepose is unavailable, inference will throw.
   */
  requiresDensePose: boolean;
  /**
   * Whether this model requires a full human-parsing input tensor.
   * If true and parsing is unavailable, inference will use the approximation.
   */
  requiresFullParsing: boolean;
  /** Input tensor names, in the order the model expects them. */
  inputNames: string[];
  /** Output tensor name. */
  outputName: string;
}

/**
 * Default model spec targeting DM-VTON student network (GAN-based, ~37 MB).
 *
 * WEIGHTS: Place the exported ONNX file at /public/models/dm-vton-student.onnx
 * EXPORT:  Run /experiments/mobile-vton/scripts/06_export_dm_vton_onnx.py
 * SOURCE:  https://github.com/KiseKloset/DM-VTON
 *
 * LIMITATIONS:
 *   - Trained on VITON-HD (Western upper-body clothing only)
 *   - Does NOT understand saree draping, pleats, or pallu
 *   - Upper body only — lower-body saree drape is NOT synthesised
 *   - Quality on saree inputs is unknown without experimental data
 *   - A saree-specific model or fine-tuning is required for production quality
 */
export const DM_VTON_SPEC: VTONModelSpec = {
  path: '/models/dm-vton-student.onnx',
  id: 'dm-vton-student-v1',
  inputWidth: 192,
  inputHeight: 256,
  requiresDensePose: false,
  requiresFullParsing: false,
  inputNames: ['person_agnostic', 'cloth', 'cloth_mask'],
  outputName: 'output',
};
