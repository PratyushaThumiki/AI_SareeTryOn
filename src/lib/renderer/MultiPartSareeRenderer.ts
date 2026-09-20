import type { Product, SareeImageParts, SareeTryOnAssets } from '@/lib/products/types';
import { POSE_LANDMARK, type Landmark } from '@/lib/vision/types';
import type { RenderInputs, RenderTarget, TryOnRenderer } from './types';
import { drawWarpedQuad, type P } from './warp';

/**
 * Multi-part saree renderer with intelligent draping.
 *
 * Why tiled textures instead of direct flat-lay warping:
 *   A flat-lay photo contains the cut/shape of the piece, seam allowances,
 *   and flat lighting. Warping it directly onto a body looks like a stiff
 *   cardboard cutout. Instead we extract a center-crop (the pure fabric
 *   texture, free of edges) and tile it across each body region — just like
 *   a tailor would cut from a fabric roll and sew it to fit the body.
 *
 * Render order (back → front):
 *   1. Camera frame
 *   2. Skirt (body fabric, waist→hem, with fold shading)
 *   3. Border strip at hem
 *   4. Pallu sash (right shoulder → left waist, nivi style)
 *   5. Body shading overlay (cylindrical lighting — darker at sides)
 *   6. Blouse (shoulder→waist with V-neck cutout)
 *   7. Segmentation mask clip (garments only appear on the body)
 */
export class MultiPartSareeRenderer implements TryOnRenderer {
  private imgs: {
    body: HTMLImageElement | null;
    pallu: HTMLImageElement | null;
    border: HTMLImageElement | null;
    blouse: HTMLImageElement | null;
  } = { body: null, pallu: null, border: null, blouse: null };

  // Pre-computed tiled fabric texture canvases — built once in init().
  // Using center-crop tiles means the camera frame shows fabric texture, not
  // the flat-lay cut-piece edges or non-uniform lighting from the photo shoot.
  private tex: {
    body: HTMLCanvasElement | null;
    pallu: HTMLCanvasElement | null;
    border: HTMLCanvasElement | null;
    blouse: HTMLCanvasElement | null;
  } = { body: null, pallu: null, border: null, blouse: null };

  private ready = false;
  private garmentLayer: HTMLCanvasElement | null = null;
  private maskLayer: HTMLCanvasElement | null = null;
  private maskImageData: ImageData | null = null;

  private smooth: {
    shoulderL: P; shoulderR: P;
    waistL: P; waistR: P;
    hemL: P; hemR: P;
  } | null = null;

  constructor(public readonly product: Product) {
    if (product.tryOnAssets.kind !== 'saree') {
      throw new Error(`MultiPartSareeRenderer received non-saree product ${product.id}`);
    }
    if (!(product.tryOnAssets as SareeTryOnAssets).parts) {
      throw new Error(`MultiPartSareeRenderer: product ${product.id} has no parts`);
    }
  }

  async init(_target: RenderTarget): Promise<void> {
    const parts = (this.product.tryOnAssets as SareeTryOnAssets).parts as SareeImageParts;

    const loadImg = async (src?: string): Promise<HTMLImageElement | null> => {
      if (!src) return null;
      const img = new Image();
      img.src = src;
      img.decoding = 'async';
      try { await img.decode(); return img; } catch { return null; }
    };

    const [body, pallu, border, blouse] = await Promise.all([
      loadImg(parts.body.src),
      loadImg(parts.pallu?.src),
      loadImg(parts.border?.src),
      loadImg(parts.blouse?.src),
    ]);

    if (!body) throw new Error(`MultiPartSareeRenderer: body image failed to load`);
    this.imgs = { body, pallu, border, blouse };

    // Build tiled texture canvases. TILE_PX controls the size of each fabric
    // repeat — larger = more zoomed-in texture, smaller = denser pattern.
    const TILE_PX = 200;
    this.tex.body   = buildTiledCanvas(body,              800, 1400, TILE_PX);
    this.tex.pallu  = buildTiledCanvas(pallu ?? body,     800, 1400, TILE_PX);
    this.tex.blouse = buildTiledCanvas(blouse ?? body,    800,  700, TILE_PX);
    this.tex.border = buildTiledCanvas(border ?? body,    800,  160, TILE_PX);

    this.garmentLayer = document.createElement('canvas');
    this.maskLayer    = document.createElement('canvas');
    this.ready = true;
  }

  draw(target: RenderTarget, inputs: RenderInputs): void {
    const { ctx, width, height, mirrored } = target;

    // ── Layer 0: camera frame (mirrored) ──────────────────────────────────
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    if (mirrored) { ctx.translate(width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(inputs.video, 0, 0, width, height);
    ctx.restore();

    if (!this.ready || !this.tex.body) return;
    const vision = inputs.vision;
    if (!vision?.landmarks) return;

    const anchors = this.computeAnchors(vision.landmarks, width, height, mirrored);
    if (!anchors) return;

    const gLayer = ensureLayer(this.garmentLayer!, width, height);
    const gCtx = gLayer.getContext('2d')!;
    gCtx.setTransform(1, 0, 0, 1, 0, 0);
    gCtx.clearRect(0, 0, width, height);

    // ── Layer 1: pleated skirt (waist → hem) ─────────────────────────────
    this.drawSkirt(gCtx, this.tex.body!, anchors);

    // ── Layer 2: border strip along hem ──────────────────────────────────
    this.drawBorderStrip(gCtx, this.tex.border!, anchors);

    // ── Layer 3: pallu diagonal sash ─────────────────────────────────────
    this.drawPallu(gCtx, this.tex.pallu!, anchors, height);

    // ── Layer 4: subtle body-shape shading (cylindrical lighting) ────────
    this.applyBodyShading(gCtx, anchors, width, height);

    // ── Layer 5: blouse (shoulder → waist) with V-neck cutout ────────────
    this.drawBlouse(gCtx, this.tex.blouse!, anchors);

    // ── Segmentation mask: clip garments to body silhouette ──────────────
    if (vision.segmentation) {
      const mLayer = ensureLayer(this.maskLayer!, width, height);
      this.drawMask(mLayer, vision.segmentation, mirrored);
      gCtx.globalCompositeOperation = 'destination-in';
      gCtx.drawImage(mLayer, 0, 0);
      gCtx.globalCompositeOperation = 'source-over';
    }

    ctx.drawImage(gLayer, 0, 0);
  }

  dispose(): void {
    this.imgs = { body: null, pallu: null, border: null, blouse: null };
    this.tex  = { body: null, pallu: null, border: null, blouse: null };
    this.garmentLayer = this.maskLayer = null;
    this.maskImageData = this.smooth = null;
    this.ready = false;
  }

  // ── Garment region drawers ───────────────────────────────────────────────

  private drawBlouse(
    ctx: CanvasRenderingContext2D,
    tex: HTMLCanvasElement,
    a: NonNullable<MultiPartSareeRenderer['smooth']>,
  ): void {
    // Warp tiled blouse texture to shoulder→waist quad.
    drawWarpedQuad(ctx, tex, 0, 0, tex.width, tex.height,
      a.shoulderL, a.shoulderR, a.waistR, a.waistL, 22);

    // V-neck cutout — erase a triangular region so the neckline shows through
    // to the camera frame (the person's actual skin/neck).
    const cx  = (a.shoulderL.x + a.shoulderR.x) / 2;
    const topY = Math.min(a.shoulderL.y, a.shoulderR.y);
    const bodyW = a.shoulderR.x - a.shoulderL.x;
    const neckHalfW = bodyW * 0.17;
    const neckDepth = (a.waistL.y - topY) * 0.32;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    // Rounded V: three control points with a quadratic curve at the bottom
    ctx.moveTo(cx - neckHalfW, topY + 4);
    ctx.quadraticCurveTo(cx - neckHalfW * 0.3, topY + neckDepth * 0.6,
                         cx, topY + neckDepth);
    ctx.quadraticCurveTo(cx + neckHalfW * 0.3, topY + neckDepth * 0.6,
                         cx + neckHalfW, topY + 4);
    // Close across the top
    ctx.lineTo(cx - neckHalfW, topY + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawSkirt(
    ctx: CanvasRenderingContext2D,
    tex: HTMLCanvasElement,
    a: NonNullable<MultiPartSareeRenderer['smooth']>,
  ): void {
    // The pleated saree skirt is a flared trapezoid from waist to hem.
    drawWarpedQuad(ctx, tex, 0, 0, tex.width, tex.height,
      a.waistL, a.waistR, a.hemR, a.hemL, 32);

    // Pleat fold simulation: pairs of shadow + highlight lines radiating
    // from center-front. Density highest at center, tapering to sides.
    const numPleats = 14;
    const cx = (a.waistL.x + a.waistR.x) / 2;
    for (let i = 0; i <= numPleats; i++) {
      const t  = i / numPleats;              // 0 = left, 1 = right
      const dt = Math.abs(t - 0.5) * 2;     // 0 at center, 1 at edges
      const alpha = 0.13 * (1 - dt * 0.5);  // pleats subtler at edges

      const tx = lerp1(a.waistL.x, a.waistR.x, t);
      const ty = lerp1(a.waistL.y, a.waistR.y, t);
      const bx = lerp1(a.hemL.x,   a.hemR.x,   t);
      const by = lerp1(a.hemL.y,   a.hemR.y,   t);

      // The pleats converge slightly toward center at the hem
      const convergence = (cx - tx) * 0.08;

      ctx.save();
      // Shadow (left side of pleat)
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(bx + convergence, by);
      ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Highlight (right side of pleat)
      ctx.beginPath();
      ctx.moveTo(tx + 2.5, ty);
      ctx.lineTo(bx + convergence + 2.5, by);
      ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.4})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawBorderStrip(
    ctx: CanvasRenderingContext2D,
    tex: HTMLCanvasElement,
    a: NonNullable<MultiPartSareeRenderer['smooth']>,
  ): void {
    const skirtH = ((a.hemL.y + a.hemR.y) - (a.waistL.y + a.waistR.y)) / 2;
    const bh = skirtH * 0.09;
    const tL: P = { x: a.hemL.x, y: a.hemL.y - bh };
    const tR: P = { x: a.hemR.x, y: a.hemR.y - bh };
    drawWarpedQuad(ctx, tex, 0, 0, tex.width, tex.height, tL, tR, a.hemR, a.hemL, 8);
  }

  private drawPallu(
    ctx: CanvasRenderingContext2D,
    tex: HTMLCanvasElement,
    a: NonNullable<MultiPartSareeRenderer['smooth']>,
    canvasH: number,
  ): void {
    // Nivi drape: pallu starts at the right shoulder (larger x in screen space
    // after mirroring = user's left shoulder in mirror), drapes diagonally
    // across the body, and tucks at the left hip (user's right hip in mirror).
    const bodyW = a.shoulderR.x - a.shoulderL.x;
    const palluW = bodyW * 0.62;

    // Diagonal sash from right shoulder to left waist
    const dtl: P = { x: a.shoulderR.x - palluW * 0.30, y: a.shoulderR.y - 6 };
    const dtr: P = { x: a.shoulderR.x + palluW * 0.70, y: a.shoulderR.y - 6 };
    const dbl: P = { x: a.waistL.x - palluW * 0.12,    y: a.waistL.y + bodyW * 0.04 };
    const dbr: P = { x: a.waistL.x + palluW * 0.88,    y: a.waistL.y + bodyW * 0.04 };

    // Hanging end: cascades from the right shoulder down
    const hangLen = Math.min(canvasH - dtr.y, bodyW * 1.2);
    const htl: P = { x: dtr.x,                y: dtr.y };
    const htr: P = { x: dtr.x + palluW * 0.45, y: dtr.y };
    const hbr: P = { x: dtr.x + palluW * 0.30, y: dtr.y + hangLen };
    const hbl: P = { x: dtr.x - palluW * 0.10, y: dtr.y + hangLen };

    ctx.save();
    ctx.globalAlpha = 0.90;

    // Main diagonal sash (upper 60% of pallu texture)
    drawWarpedQuad(ctx, tex, 0, 0, tex.width, Math.round(tex.height * 0.60),
      dtl, dtr, dbr, dbl, 26);

    // Hanging end (lower 40% — the decorated pallu end)
    drawWarpedQuad(ctx, tex, 0, Math.round(tex.height * 0.60),
      tex.width, Math.round(tex.height * 0.40),
      htl, htr, hbr, hbl, 14);

    ctx.globalAlpha = 1.0;
    ctx.restore();
  }

  private applyBodyShading(
    ctx: CanvasRenderingContext2D,
    a: NonNullable<MultiPartSareeRenderer['smooth']>,
    w: number,
    h: number,
  ): void {
    // Simulate cylindrical body lighting: lighter at the front-center,
    // progressively darker toward the sides, mimicking how a garment curves
    // around a 3D body.
    const cx = (a.waistL.x + a.waistR.x) / 2;

    // Left-side shadow
    const lg = ctx.createLinearGradient(a.shoulderL.x - 10, 0, cx, 0);
    lg.addColorStop(0, 'rgba(0,0,0,0.22)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, w, h);

    // Right-side shadow
    const rg = ctx.createLinearGradient(cx, 0, a.shoulderR.x + 10, 0);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);

    // Subtle top-down ambient occlusion (darker at very bottom hem)
    const bg = ctx.createLinearGradient(0, a.waistL.y, 0, h);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }

  // ── Pose anchor computation ─────────────────────────────────────────────

  private computeAnchors(
    landmarks: Landmark[],
    width: number,
    height: number,
    mirrored: boolean,
  ): MultiPartSareeRenderer['smooth'] | null {
    const px = (i: number) => {
      const p = landmarks[i];
      if (!p) return null;
      return { x: (mirrored ? 1 - p.x : p.x) * width, y: p.y * height, v: p.visibility };
    };

    const ls = px(POSE_LANDMARK.LEFT_SHOULDER);
    const rs = px(POSE_LANDMARK.RIGHT_SHOULDER);
    const lh = px(POSE_LANDMARK.LEFT_HIP);
    const rh = px(POSE_LANDMARK.RIGHT_HIP);
    const la = px(POSE_LANDMARK.LEFT_ANKLE);
    const ra = px(POSE_LANDMARK.RIGHT_ANKLE);
    if (!ls || !rs || !lh || !rh) return null;
    if (Math.min(ls.v, rs.v, lh.v, rh.v) < 0.35) return null;

    const [sL, sR] = ls.x < rs.x ? [ls, rs] : [rs, ls];
    const [hL, hR] = lh.x < rh.x ? [lh, rh] : [rh, lh];
    const sVec = { x: sR.x - sL.x, y: sR.y - sL.y };
    const hVec = { x: hR.x - hL.x, y: hR.y - hL.y };

    const shoulderL: P = { x: sL.x - sVec.x * 0.32, y: sL.y - sVec.y * 0.32 };
    const shoulderR: P = { x: sR.x + sVec.x * 0.32, y: sR.y + sVec.y * 0.32 };
    const waistL: P   = { x: hL.x - hVec.x * 0.42, y: hL.y - hVec.y * 0.42 };
    const waistR: P   = { x: hR.x + hVec.x * 0.42, y: hR.y + hVec.y * 0.42 };

    let hemL: P, hemR: P;
    if (la && ra && la.v > 0.3 && ra.v > 0.3) {
      const [aL, aR] = la.x < ra.x ? [la, ra] : [ra, la];
      const aVec = { x: aR.x - aL.x, y: aR.y - aL.y };
      const bot = Math.max(aL.y, aR.y) + 20;
      hemL = { x: aL.x - aVec.x * 0.88, y: bot };
      hemR = { x: aR.x + aVec.x * 0.88, y: bot };
    } else {
      const w = waistR.x - waistL.x;
      hemL = { x: waistL.x - w * 0.24, y: height * 0.98 };
      hemR = { x: waistR.x + w * 0.24, y: height * 0.98 };
    }

    const raw = { shoulderL, shoulderR, waistL, waistR, hemL, hemR };
    if (!this.smooth) {
      this.smooth = raw;
    } else {
      const α = 0.55;
      const m = (f: P, t: P): P => ({ x: f.x + (t.x - f.x) * α, y: f.y + (t.y - f.y) * α });
      this.smooth = {
        shoulderL: m(this.smooth.shoulderL, raw.shoulderL),
        shoulderR: m(this.smooth.shoulderR, raw.shoulderR),
        waistL:    m(this.smooth.waistL,    raw.waistL),
        waistR:    m(this.smooth.waistR,    raw.waistR),
        hemL:      m(this.smooth.hemL,      raw.hemL),
        hemR:      m(this.smooth.hemR,      raw.hemR),
      };
    }
    return this.smooth;
  }

  // ── Utilities ──────────────────────────────────────────────────────────

  private drawMask(
    canvas: HTMLCanvasElement,
    seg: NonNullable<RenderInputs['vision']>['segmentation'] extends infer S
      ? (S extends null ? never : S) : never,
    mirrored: boolean,
  ): void {
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const { width: mw, height: mh, data } = seg!;
    if (!this.maskImageData || this.maskImageData.width !== mw || this.maskImageData.height !== mh) {
      this.maskImageData = new ImageData(mw, mh);
    }
    const rgba = this.maskImageData.data;
    for (let i = 0, j = 0; i < data.length; i++, j += 4) {
      const v = Math.min(1, Math.max(0, (data[i]! - 0.35) / 0.5));
      rgba[j] = rgba[j + 1] = rgba[j + 2] = 255;
      rgba[j + 3] = Math.round(v * 255);
    }
    const stage = document.createElement('canvas');
    stage.width = mw; stage.height = mh;
    stage.getContext('2d')!.putImageData(this.maskImageData, 0, 0);
    if (mirrored) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(stage, 0, 0, canvas.width, canvas.height);
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────

/**
 * Build a large canvas filled with a tiled center-crop of `img`.
 *
 * Why center-crop? Flat-lay photos have visible cut edges, uneven lighting
 * toward the edges, and seam/hem lines. The center region contains clean,
 * representative fabric texture. We tile it to cover the full destination
 * canvas so `drawWarpedQuad` gets a seamless texture source to warp from.
 *
 * @param img        Source fabric photo
 * @param canvasW/H  Dimensions of the output texture canvas
 * @param tileSize   Pixel size of one repeat (larger = more zoomed-in texture)
 */
function buildTiledCanvas(
  img: HTMLImageElement,
  canvasW: number,
  canvasH: number,
  tileSize: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width  = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const iw = img.naturalWidth  || img.width  || 1;
  const ih = img.naturalHeight || img.height || 1;

  // Center 60% crop — avoids edges, cut patterns, shadow gradients from photography
  const frac  = 0.60;
  const cropW = iw * frac;
  const cropH = ih * frac;
  const cropX = (iw - cropW) / 2;
  const cropY = (ih - cropH) / 2;

  for (let y = 0; y < canvasH; y += tileSize) {
    for (let x = 0; x < canvasW; x += tileSize) {
      ctx.drawImage(img, cropX, cropY, cropW, cropH, x, y, tileSize, tileSize);
    }
  }

  return canvas;
}

function lerp1(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function ensureLayer(canvas: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return canvas;
}
