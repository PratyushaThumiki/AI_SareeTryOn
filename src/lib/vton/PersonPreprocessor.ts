import type { VisionFrame } from '@/lib/vision/types';
import { POSE_LANDMARK } from '@/lib/vision/types';
import type { PersonCondition } from './types';

/**
 * PersonPreprocessor
 *
 * Converts a captured frame + MediaPipe vision data into the person-side
 * conditioning inputs required by a VTON model.
 *
 * VTON models typically require three person inputs:
 *   1. person image — the original photograph
 *   2. agnostic mask — person with clothing region erased
 *   3. pose image — skeleton drawn on black background
 *
 * BROWSER LIMITATIONS (documented, not worked around):
 *   - DensePose UV maps require detectron2 — not available in browser.
 *     hasFullParsing and hasDensePose will always be false.
 *   - Human parsing (SCHP, 20-class body map) requires a separate ONNX model
 *     (parsing_atr.onnx or parsing_lip.onnx). This is a separate model that
 *     can be loaded in-browser if the weights are provided at /models/parser.onnx.
 *     For now, the agnostic mask is approximated from pose landmarks.
 *   - The agnostic mask quality is lower than SCHP. The clothing region is
 *     approximated as the torso bounding box from shoulder/hip landmarks.
 */
export class PersonPreprocessor {
  process(
    snapshot: HTMLCanvasElement,
    visionFrame: VisionFrame | null,
    outputWidth: number,
    outputHeight: number,
  ): PersonCondition {
    const personCanvas = resizeCanvas(snapshot, outputWidth, outputHeight);
    const poseCanvas = buildPoseCanvas(visionFrame, outputWidth, outputHeight);
    const agnosticCanvas = buildAgnosticCanvas(
      personCanvas,
      visionFrame,
      outputWidth,
      outputHeight,
    );

    return {
      personCanvas,
      agnosticCanvas,
      poseCanvas,
      hasFullParsing: false,
      hasDensePose: false,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resizeCanvas(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const dst = document.createElement('canvas');
  dst.width = w;
  dst.height = h;
  const ctx = dst.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return dst;
}

/**
 * Draw the 33-point MediaPipe skeleton on a black canvas.
 * Converts MediaPipe COCO-33 format to pixel positions at the output resolution.
 */
function buildPoseCanvas(
  vision: VisionFrame | null,
  w: number,
  h: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  if (!vision?.landmarks) return canvas;

  const lm = vision.landmarks;
  const px = (i: number) => {
    const p = lm[i];
    if (!p || p.visibility < 0.3) return null;
    return { x: p.x * w, y: p.y * h };
  };

  // Draw skeleton connections — standard MediaPipe pose pairs
  const pairs: [number, number][] = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],  // arms
    [11, 23], [12, 24], [23, 24],                       // torso
    [23, 25], [25, 27], [24, 26], [26, 28],             // legs
  ];

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, Math.round(w / 64));
  ctx.lineCap = 'round';

  for (const [a, b] of pairs) {
    const pa = px(a);
    const pb = px(b);
    if (!pa || !pb) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  // Draw keypoints
  ctx.fillStyle = '#00ff88';
  const radius = Math.max(2, Math.round(w / 96));
  for (let i = 0; i < lm.length; i++) {
    const p = px(i);
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, 2 * Math.PI);
    ctx.fill();
  }

  return canvas;
}

/**
 * Build the clothing-agnostic person image.
 *
 * The agnostic mask erases the clothing region from the person image.
 * The VTON model fills this erased region with the new garment.
 *
 * Strategy: use the torso bounding region defined by shoulder and hip landmarks,
 * expanded by a margin to fully cover any upper-body clothing.
 *
 * LIMITATION: This is a rectangular-ish region, not a precise clothing silhouette.
 * SCHP human parsing would produce a pixel-accurate clothing mask. Without it,
 * the erased region may be slightly too large or too small.
 */
function buildAgnosticCanvas(
  personCanvas: HTMLCanvasElement,
  vision: VisionFrame | null,
  w: number,
  h: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Start with the person image
  ctx.drawImage(personCanvas, 0, 0, w, h);

  if (!vision?.landmarks) return canvas;

  const lm = vision.landmarks;
  const px = (i: number) => {
    const p = lm[i];
    if (!p || p.visibility < 0.3) return null;
    return { x: p.x * w, y: p.y * h };
  };

  const ls = px(POSE_LANDMARK.LEFT_SHOULDER);
  const rs = px(POSE_LANDMARK.RIGHT_SHOULDER);
  const lh = px(POSE_LANDMARK.LEFT_HIP);
  const rh = px(POSE_LANDMARK.RIGHT_HIP);

  if (!ls || !rs || !lh || !rh) return canvas;

  const minX = Math.min(ls.x, rs.x, lh.x, rh.x);
  const maxX = Math.max(ls.x, rs.x, lh.x, rh.x);
  const minY = Math.min(ls.y, rs.y);
  const maxY = Math.max(lh.y, rh.y);

  const torsoW = maxX - minX;
  const torsoH = maxY - minY;

  // Expand by 20% horizontally and 10% vertically to cover clothing edges
  const marginX = torsoW * 0.20;
  const marginY = torsoH * 0.10;

  const maskX = Math.max(0, minX - marginX);
  const maskY = Math.max(0, minY - marginY);
  const maskW = Math.min(w - maskX, torsoW + marginX * 2);
  const maskH = Math.min(h - maskY, torsoH + marginY * 2);

  // Erase the clothing region using destination-out compositing
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,1)';
  // Rounded rectangle for softer edges
  roundRect(ctx, maskX, maskY, maskW, maskH, Math.min(maskW, maskH) * 0.08);
  ctx.fill();
  ctx.restore();

  // Fill the erased region with a neutral grey (model expects content there, not transparency)
  ctx.save();
  ctx.fillStyle = '#7f7f7f';
  roundRect(ctx, maskX, maskY, maskW, maskH, Math.min(maskW, maskH) * 0.08);
  ctx.fill();
  ctx.restore();

  return canvas;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
