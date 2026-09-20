/**
 * Product schema.
 *
 * The core Product type is deliberately generic. Category-specific try-on
 * assets are expressed through a discriminated union on `tryOnAssets.kind`.
 * This lets sarees ship today and dresses/jewelry/glasses/shoes plug in
 * later without modifying existing consumers — they only need to add a new
 * variant to the union and a matching renderer.
 *
 * See `src/lib/renderer/GarmentRegistry.ts` for how renderers are chosen
 * from `tryOnAssets.kind`.
 */

export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP';

export type ProductCategory =
  | 'saree'
  | 'dress'
  | 'shirt'
  | 'jewelry'
  | 'glasses'
  | 'shoes'
  | 'accessory';

/** A single image reference. `src` may be a URL or a data: URI. */
export interface ImageRef {
  src: string;
  width?: number;
  height?: number;
  alt?: string;
}

/** Color in hex; optional name for display. */
export interface ColorSwatch {
  hex: string;
  name?: string;
}

/**
 * Multi-part saree image set.
 *
 * Each field is a separate photo of the saree taken from the angle best
 * suited for rendering that body region. All fields are optional — the
 * renderer falls back to the `body` image for any missing part.
 *
 * Recommended photo guidelines for each part:
 *   body   — flat-lay of the full saree unfolded, lit evenly. Used as the
 *             texture for both the pleated skirt region and as the pallu
 *             fallback. Shoot from directly above.
 *   pallu  — the decorated end of the saree (the 1m "pallu" section) laid
 *             out flat. If omitted, a cropped section of `body` is used.
 *   border — just the border strip isolated (crop tightly, landscape).
 *             Used as a strip along the hem and pallu edge.
 *   blouse — the blouse piece fabric. Used for the torso region.
 *             If omitted, `body` is used for the torso too.
 */
export interface SareeImageParts {
  body: ImageRef;
  pallu?: ImageRef;
  border?: ImageRef;
  blouse?: ImageRef;
}

/**
 * Saree-specific try-on payload.
 *
 * Two rendering modes are supported:
 *   • Multi-part (preferred): set `parts` with separate images per body
 *     region. The `MultiPartSareeRenderer` will use them.
 *   • Single-composite (legacy SVG fallback): set `garment` with a single
 *     image. The original `SareeRenderer` will be used automatically.
 *
 * At least one of `parts` or `garment` must be present.
 */
export interface SareeTryOnAssets {
  kind: 'saree';

  /** v2: separate real-photo assets per body region. */
  parts?: SareeImageParts;

  /** v1: single composite SVG/PNG (kept for procedural placeholders). */
  garment?: ImageRef;

  /** Region of `garment` occupied by the pallu (v1 only). */
  pallu?: { x: number; y: number; w: number; h: number };
  /** Region of `garment` occupied by the border (v1 only). */
  border?: { x: number; y: number; w: number; h: number };

  primaryColors: ColorSwatch[];
  drapingStyle?: 'nivi' | 'bengali' | 'gujarati' | 'maharashtrian' | 'south';

  /**
   * Body-space anchor points expressed in [0..1] normalised coordinates.
   * Shared by both renderers. The multi-part renderer uses these to know
   * how to orient images relative to the body landmark quad.
   */
  anchors: {
    shoulderLine: { left: [number, number]; right: [number, number] };
    waist: { left: [number, number]; right: [number, number] };
    hem: { left: [number, number]; right: [number, number] };
  };
}

/** Extensibility placeholders — implemented later. */
export interface DressTryOnAssets {
  kind: 'dress';
  front: ImageRef;
  back?: ImageRef;
  garmentMask?: ImageRef;
  sleeve: 'sleeveless' | 'short' | 'three-quarter' | 'full';
  neckline: 'round' | 'v' | 'boat' | 'sweetheart' | 'halter';
  anchors: {
    shoulderLine: { left: [number, number]; right: [number, number] };
    waist: { left: [number, number]; right: [number, number] };
    hem: { left: [number, number]; right: [number, number] };
  };
}

export interface JewelryTryOnAssets {
  kind: 'jewelry';
  subtype: 'necklace' | 'earring' | 'bracelet' | 'ring';
  image: ImageRef;
  anchor: 'neck' | 'ear-left' | 'ear-right' | 'wrist-left' | 'wrist-right' | 'finger';
}

export interface GlassesTryOnAssets {
  kind: 'glasses';
  frame: ImageRef;
  frameGeometry?: {
    pupillaryDistanceMm: number;
    frameWidthMm: number;
  };
}

export interface ShoesTryOnAssets {
  kind: 'shoes';
  image: ImageRef;
  fits: 'flat' | 'heel' | 'boot';
}

export type TryOnAssets =
  | SareeTryOnAssets
  | DressTryOnAssets
  | JewelryTryOnAssets
  | GlassesTryOnAssets
  | ShoesTryOnAssets;

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  subcategory?: string;
  price: number;
  currency: Currency;
  brand: string;
  colors: ColorSwatch[];
  fabric?: string;
  images: ImageRef[];
  tryOnAssets: TryOnAssets;
  metadata?: Record<string, string | number | boolean>;
}
