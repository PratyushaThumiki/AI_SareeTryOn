/**
 * Canvas 2D affine strip-warp helpers.
 *
 * Canvas 2D does not support quad-to-quad projective warping. To fake it,
 * we slice each source rectangle into N horizontal strips and render each
 * strip with its own affine transform that maps the strip's top and
 * bottom edges to the destination trapezoid. With enough strips this is
 * visually indistinguishable from a projective warp for the moderate
 * perspective changes we get from a torso-length garment.
 */

export interface P {
  x: number;
  y: number;
}

export function lerp(a: P, b: P, t: number): P {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Warp `img[sx,sy,sw,sh]` onto the destination quad
 * (dtl, dtr, dbr, dbl) — order matters (top-left, top-right, bottom-right, bottom-left).
 */
export function drawWarpedQuad(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dtl: P,
  dtr: P,
  dbr: P,
  dbl: P,
  segments = 24,
): void {
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;

    const srcY0 = sy + t0 * sh;
    const srcHeight = (t1 - t0) * sh;

    const ptl = lerp(dtl, dbl, t0);
    const ptr = lerp(dtr, dbr, t0);
    const pbl = lerp(dtl, dbl, t1);

    // Solve 2x3 affine that maps the three source corners to the three
    // destination corners. The remaining corner is implicit and will land
    // near the true `pbr` when strips are thin.
    const a = (ptr.x - ptl.x) / sw;
    const b = (ptr.y - ptl.y) / sw;
    const c = (pbl.x - ptl.x) / srcHeight;
    const d = (pbl.y - ptl.y) / srcHeight;
    const e = ptl.x - a * sx - c * srcY0;
    const f = ptl.y - b * sx - d * srcY0;

    ctx.save();
    ctx.setTransform(a, b, c, d, e, f);
    // Small overdraw between strips (`srcHeight + 0.5`) hides subpixel
    // seams. The transparent SVG background means extra pixels alpha
    // to zero and don't smear.
    ctx.drawImage(img, sx, srcY0, sw, srcHeight + 0.5, sx, srcY0, sw, srcHeight + 0.5);
    ctx.restore();
  }
}
