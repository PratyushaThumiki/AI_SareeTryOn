import type { Product, SareeTryOnAssets } from '@/lib/products/types';
import { POSE_LANDMARK, type Landmark } from '@/lib/vision/types';
import type { RenderInputs, RenderTarget, TryOnRenderer } from './types';
import { drawWarpedQuad, type P } from './warp';

/**
 * Saree renderer for the MVP.
 *
 * Strategy:
 *   1. Draw the mirrored camera frame as the base layer.
 *   2. Read pose landmarks and expand shoulder / waist / hem to
 *      approximate the outer silhouette of a draped saree.
 *   3. Warp the garment SVG into two trapezoidal regions (upper strip
 *      from shoulders to waist, lower strip from waist to hem) using an
 *      N-slice affine warp — see `warp.ts`.
 *   4. Use the person-segmentation mask, if present, to clip the garment
 *      to the person's silhouette. This transforms the render from
 *      "sticker on top of scene" into "worn over the body".
 *   5. Apply mild temporal smoothing on the anchors to hide pose jitter.
 *
 * The renderer is deliberately pure: it never uploads anything, never
 * stores frames, and only holds references to CanvasImageSources it
 * needs to draw. Disposing it drops every reference.
 */
export class SareeRenderer implements TryOnRenderer {
  private garmentImg: HTMLImageElement | null = null;
  private ready = false;

  // Offscreen buffers, allocated on init and resized as needed.
  private garmentLayer: HTMLCanvasElement | null = null;
  private maskLayer: HTMLCanvasElement | null = null;
  private maskImageData: ImageData | null = null;

  // Smoothed anchor cache — EMA of the last computed anchors.
  private smooth: {
    shoulderL: P;
    shoulderR: P;
    waistL: P;
    waistR: P;
    hemL: P;
    hemR: P;
  } | null = null;

  constructor(public readonly product: Product) {
    if (product.tryOnAssets.kind !== 'saree') {
      throw new Error(`SareeRenderer received non-saree product ${product.id}`);
    }
  }

  async init(_target: RenderTarget): Promise<void> {
    const asset = (this.product.tryOnAssets as SareeTryOnAssets).garment;
    if (!asset) throw new Error(`SareeRenderer: product ${this.product.id} has no garment image`);
    const img = new Image();
    // Data-URI SVGs never trigger a network request, so this is safe
    // under the strict CSP.
    img.src = asset.src;
    img.decoding = 'async';
    await img.decode();
    this.garmentImg = img;

    this.garmentLayer = document.createElement('canvas');
    this.maskLayer = document.createElement('canvas');
    this.ready = true;
  }

  draw(target: RenderTarget, inputs: RenderInputs): void {
    const { ctx, width, height, mirrored } = target;

    // Layer 0: the raw camera frame, mirrored if the target requests it.
    // This keeps the "virtual mirror" feel — the user sees themselves as
    // they would in a real mirror.
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    if (mirrored) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    // Draw the video with contain-like sizing (the CameraManager sets the
    // canvas to the same aspect ratio as the video, so drawImage-scale is
    // a straight uniform scale).
    ctx.drawImage(inputs.video, 0, 0, width, height);
    ctx.restore();

    if (!this.ready || !this.garmentImg) return;
    const vision = inputs.vision;
    if (!vision || !vision.landmarks) return;

    const anchors = this.computeAnchors(vision.landmarks, width, height, mirrored);
    if (!anchors) return;

    // Layer 1: render garment into an offscreen canvas so we can mask it.
    const gLayer = this.ensureLayer(this.garmentLayer!, width, height);
    const gCtx = gLayer.getContext('2d')!;
    gCtx.setTransform(1, 0, 0, 1, 0, 0);
    gCtx.clearRect(0, 0, width, height);

    const source = this.product.tryOnAssets as SareeTryOnAssets;
    const gw = this.garmentImg.naturalWidth || this.garmentImg.width;
    const gh = this.garmentImg.naturalHeight || this.garmentImg.height;

    const sSL = anchorPx(source.anchors.shoulderLine.left, gw, gh);
    const sSR = anchorPx(source.anchors.shoulderLine.right, gw, gh);
    const sWL = anchorPx(source.anchors.waist.left, gw, gh);
    const sWR = anchorPx(source.anchors.waist.right, gw, gh);
    const sHL = anchorPx(source.anchors.hem.left, gw, gh);
    const sHR = anchorPx(source.anchors.hem.right, gw, gh);

    // Upper strip: shoulders → waist
    const upperSrcMinX = Math.min(sSL.x, sWL.x);
    const upperSrcMaxX = Math.max(sSR.x, sWR.x);
    const upperSrcMinY = Math.min(sSL.y, sSR.y);
    const upperSrcMaxY = Math.max(sWL.y, sWR.y);
    drawWarpedQuad(
      gCtx,
      this.garmentImg,
      upperSrcMinX,
      upperSrcMinY,
      upperSrcMaxX - upperSrcMinX,
      upperSrcMaxY - upperSrcMinY,
      anchors.shoulderL,
      anchors.shoulderR,
      anchors.waistR,
      anchors.waistL,
      20,
    );

    // Lower strip: waist → hem
    const lowerSrcMinX = Math.min(sWL.x, sHL.x);
    const lowerSrcMaxX = Math.max(sWR.x, sHR.x);
    const lowerSrcMinY = Math.min(sWL.y, sWR.y);
    const lowerSrcMaxY = Math.max(sHL.y, sHR.y);
    drawWarpedQuad(
      gCtx,
      this.garmentImg,
      lowerSrcMinX,
      lowerSrcMinY,
      lowerSrcMaxX - lowerSrcMinX,
      lowerSrcMaxY - lowerSrcMinY,
      anchors.waistL,
      anchors.waistR,
      anchors.hemR,
      anchors.hemL,
      28,
    );

    // Layer 2: if we have a person mask, intersect it with the garment
    // so the garment only appears on the body silhouette (giving a
    // "worn" look). Skipped cleanly when segmentation is unavailable.
    if (vision.segmentation) {
      const mLayer = this.ensureLayer(this.maskLayer!, width, height);
      this.drawMask(mLayer, vision.segmentation, mirrored);
      gCtx.globalCompositeOperation = 'destination-in';
      gCtx.drawImage(mLayer, 0, 0);
      gCtx.globalCompositeOperation = 'source-over';
    }

    // Composite the garment layer over the video.
    ctx.drawImage(gLayer, 0, 0);
  }

  dispose(): void {
    this.garmentImg = null;
    this.garmentLayer = null;
    this.maskLayer = null;
    this.maskImageData = null;
    this.smooth = null;
    this.ready = false;
  }

  // -----------------------------------------------------------------

  private computeAnchors(
    landmarks: Landmark[],
    width: number,
    height: number,
    mirrored: boolean,
  ): SareeRenderer['smooth'] | null {
    const px = (i: number) => {
      const p = landmarks[i];
      if (!p) return null;
      const x = mirrored ? (1 - p.x) * width : p.x * width;
      const y = p.y * height;
      return { x, y, v: p.visibility };
    };

    const ls = px(POSE_LANDMARK.LEFT_SHOULDER);
    const rs = px(POSE_LANDMARK.RIGHT_SHOULDER);
    const lh = px(POSE_LANDMARK.LEFT_HIP);
    const rh = px(POSE_LANDMARK.RIGHT_HIP);
    const la = px(POSE_LANDMARK.LEFT_ANKLE);
    const ra = px(POSE_LANDMARK.RIGHT_ANKLE);
    if (!ls || !rs || !lh || !rh) return null;

    const minCoreV = Math.min(ls.v, rs.v, lh.v, rh.v);
    if (minCoreV < 0.35) return null;

    // Mirroring the frame swaps the person's left/right in the viewer's
    // frame. Whichever side has the smaller x is the "left" from the
    // viewer's perspective. We normalize so `shoulderL` is always the
    // viewer-left corner of the garment.
    const [shoulderLeft, shoulderRight] = ls.x < rs.x ? [ls, rs] : [rs, ls];
    const [hipLeft, hipRight] = lh.x < rh.x ? [lh, rh] : [rh, lh];

    const shoulderVec = { x: shoulderRight.x - shoulderLeft.x, y: shoulderRight.y - shoulderLeft.y };
    const hipVec = { x: hipRight.x - hipLeft.x, y: hipRight.y - hipLeft.y };

    const shoulderExpand = 0.35;
    const hipExpand = 0.45;

    const shoulderL: P = {
      x: shoulderLeft.x - shoulderVec.x * shoulderExpand,
      y: shoulderLeft.y - shoulderVec.y * shoulderExpand,
    };
    const shoulderR: P = {
      x: shoulderRight.x + shoulderVec.x * shoulderExpand,
      y: shoulderRight.y + shoulderVec.y * shoulderExpand,
    };
    const waistL: P = {
      x: hipLeft.x - hipVec.x * hipExpand,
      y: hipLeft.y - hipVec.y * hipExpand,
    };
    const waistR: P = {
      x: hipRight.x + hipVec.x * hipExpand,
      y: hipRight.y + hipVec.y * hipExpand,
    };

    let hemL: P;
    let hemR: P;
    const ankleValid = la && ra && la.v > 0.3 && ra.v > 0.3;
    if (ankleValid) {
      const [ankleLeft, ankleRight] = la.x < ra.x ? [la, ra] : [ra, la];
      const ankleVec = { x: ankleRight.x - ankleLeft.x, y: ankleRight.y - ankleLeft.y };
      const flare = 0.9;
      hemL = { x: ankleLeft.x - ankleVec.x * flare, y: Math.max(ankleLeft.y, ankleRight.y) + 20 };
      hemR = { x: ankleRight.x + ankleVec.x * flare, y: Math.max(ankleLeft.y, ankleRight.y) + 20 };
    } else {
      const flare = 0.25;
      const waistW = waistR.x - waistL.x;
      hemL = { x: waistL.x - waistW * flare, y: height * 0.98 };
      hemR = { x: waistR.x + waistW * flare, y: height * 0.98 };
    }

    const raw = { shoulderL, shoulderR, waistL, waistR, hemL, hemR };
    // Temporal smoothing: EMA with alpha=0.55 (roughly ~2 frames of lag).
    // The pose model is stable enough that a lighter EMA looks tight but
    // still hides sub-pixel jitter on the hem.
    if (!this.smooth) {
      this.smooth = raw;
    } else {
      const a = 0.55;
      const mix = (from: P, to: P): P => ({
        x: from.x + (to.x - from.x) * a,
        y: from.y + (to.y - from.y) * a,
      });
      this.smooth = {
        shoulderL: mix(this.smooth.shoulderL, raw.shoulderL),
        shoulderR: mix(this.smooth.shoulderR, raw.shoulderR),
        waistL: mix(this.smooth.waistL, raw.waistL),
        waistR: mix(this.smooth.waistR, raw.waistR),
        hemL: mix(this.smooth.hemL, raw.hemL),
        hemR: mix(this.smooth.hemR, raw.hemR),
      };
    }
    return this.smooth;
  }

  private ensureLayer(canvas: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return canvas;
  }

  private drawMask(
    canvas: HTMLCanvasElement,
    seg: NonNullable<RenderInputs['vision']>['segmentation'] extends infer S
      ? S extends null
        ? never
        : S
      : never,
    mirrored: boolean,
  ): void {
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Build an ImageData at the mask's native resolution, then draw it
    // upscaled to the canvas dimensions.
    const { width: mw, height: mh, data } = seg!;
    if (!this.maskImageData || this.maskImageData.width !== mw || this.maskImageData.height !== mh) {
      this.maskImageData = new ImageData(mw, mh);
    }
    const rgba = this.maskImageData.data;
    for (let i = 0, j = 0; i < data.length; i++, j += 4) {
      // Slight thresholding: values above 0.4 render at full alpha, values
      // below fall off smoothly. Keeps the garment edge from vibrating on
      // low-contrast backgrounds.
      const v = Math.min(1, Math.max(0, (data[i]! - 0.35) / 0.5));
      rgba[j] = 255;
      rgba[j + 1] = 255;
      rgba[j + 2] = 255;
      rgba[j + 3] = Math.round(v * 255);
    }

    // Stage the mask on a temp small canvas so we can drawImage-scale it.
    const stage = document.createElement('canvas');
    stage.width = mw;
    stage.height = mh;
    stage.getContext('2d')!.putImageData(this.maskImageData, 0, 0);

    if (mirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(stage, 0, 0, canvas.width, canvas.height);
  }
}

function anchorPx([nx, ny]: [number, number], w: number, h: number): P {
  return { x: nx * w, y: ny * h };
}
