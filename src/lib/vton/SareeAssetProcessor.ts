import type { SareeTryOnAssets } from '@/lib/products/types';
import type { ConditionedGarment } from './types';

const CANONICAL_W = 768;
const CANONICAL_H = 1024;

/**
 * SareeAssetProcessor
 *
 * Converts the four saree catalogue assets (body, border, pallu, blouse) into
 * a structured garment conditioning image that a VTON model can consume.
 *
 * This is NOT a 2×2 image grid. Each component is placed where it semantically
 * belongs in a real saree layout:
 *
 *   Body fabric  — fills the entire background (the main textile)
 *   Border       — bottom 8% strip (where the border appears at the hem)
 *   Pallu        — top-right 40% width × 45% height (where the pallu drapes)
 *   Blouse       — stored separately as upper-body conditioning
 *
 * This spatial arrangement is semantically closer to how a saree appears when
 * laid flat. It is still a far cry from what a saree-specific VTON model would
 * need — this strategy conditions generic VTON models with the best single-image
 * representation we can construct from 4 flat-lay photos.
 *
 * LIMITATION: Models trained on Western clothing have no concept of saree
 * draping. This conditioning improves colour/texture fidelity; it does NOT
 * produce realistic draping, pleats, or pallu without a saree-specific model.
 */
export class SareeAssetProcessor {
  async process(assets: SareeTryOnAssets): Promise<ConditionedGarment> {
    if (!assets.parts) {
      throw new Error('SareeAssetProcessor: tryOnAssets.parts is required for Phase 2');
    }

    const { body, border, pallu, blouse } = assets.parts;

    // Load all images in parallel, treating each as optional except body.
    const [bodyImg, borderImg, palluImg, blouseImg] = await Promise.all([
      loadImage(body.src),
      border ? loadImage(border.src).catch(() => null) : Promise.resolve(null),
      pallu  ? loadImage(pallu.src).catch(() => null)  : Promise.resolve(null),
      blouse ? loadImage(blouse.src).catch(() => null) : Promise.resolve(null),
    ]);

    if (!bodyImg) throw new Error('SareeAssetProcessor: body image failed to load');

    // ── 1. Build canonical saree garment composition ──────────────────────
    const garmentCanvas = document.createElement('canvas');
    garmentCanvas.width = CANONICAL_W;
    garmentCanvas.height = CANONICAL_H;
    const gc = garmentCanvas.getContext('2d')!;

    // Layer 1: body fabric fills the entire canvas (scaled to cover).
    drawCover(gc, bodyImg, 0, 0, CANONICAL_W, CANONICAL_H);

    // Layer 2: border strip at the bottom 8% — this is where the saree border
    // appears at the hem when worn.
    if (borderImg) {
      const borderH = Math.round(CANONICAL_H * 0.08);
      drawCover(gc, borderImg, 0, CANONICAL_H - borderH, CANONICAL_W, borderH);
    }

    // Layer 3: pallu panel at the top-right, 40% width × 45% height.
    // The pallu drapes from the shoulder across the chest/back. Positioning it
    // in the top-right with slight transparency signals its layered nature.
    if (palluImg) {
      const palluW = Math.round(CANONICAL_W * 0.40);
      const palluH = Math.round(CANONICAL_H * 0.45);
      const palluX = CANONICAL_W - palluW;
      gc.save();
      gc.globalAlpha = 0.85;
      drawCover(gc, palluImg, palluX, 0, palluW, palluH);
      gc.restore();
    }

    // ── 2. Build garment mask (white where fabric exists) ─────────────────
    // For this composition, the entire canvas has fabric — the mask is all-white.
    // Models that require a separate cloth mask use this.
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = CANONICAL_W;
    maskCanvas.height = CANONICAL_H;
    const mc = maskCanvas.getContext('2d')!;
    mc.fillStyle = '#ffffff';
    mc.fillRect(0, 0, CANONICAL_W, CANONICAL_H);

    // ── 3. Build individual component canvases (for multi-channel conditioning) ─
    const bodyCanvas = toCanvas(bodyImg, CANONICAL_W, CANONICAL_H);
    const borderCanvas = borderImg ? toCanvas(borderImg, CANONICAL_W, Math.round(CANONICAL_H * 0.08)) : null;
    const palluCanvas  = palluImg  ? toCanvas(palluImg, Math.round(CANONICAL_W * 0.4), Math.round(CANONICAL_H * 0.45)) : null;
    const blouseCanvas = blouseImg ? toCanvas(blouseImg, Math.round(CANONICAL_W * 0.5), Math.round(CANONICAL_H * 0.3)) : null;

    return {
      garmentCanvas,
      garmentMaskCanvas: maskCanvas,
      components: {
        body: bodyCanvas,
        border: borderCanvas,
        pallu: palluCanvas,
        blouse: blouseCanvas,
      },
      availability: {
        body: true,
        border: borderImg !== null,
        pallu: palluImg !== null,
        blouse: blouseImg !== null,
      },
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * Draw an image scaled to cover a rectangle (like CSS background-size: cover).
 * Centers the image within the target region.
 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
): void {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(w / iw, h / ih);
  const sw = iw * scale;
  const sh = ih * scale;
  const ox = x + (w - sw) / 2;
  const oy = y + (h - sh) / 2;
  ctx.drawImage(img, ox, oy, sw, sh);
}

/** Copy an image into a new canvas at specified dimensions (scale to fit). */
function toCanvas(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}
