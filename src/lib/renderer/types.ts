import type { Product, TryOnAssets } from '@/lib/products/types';
import type { VisionFrame } from '@/lib/vision/types';

export interface RenderTarget {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Logical pixel width (CSS px). */
  width: number;
  /** Logical pixel height (CSS px). */
  height: number;
  /** Device pixel ratio the canvas is scaled to. */
  dpr: number;
  /** True when the video is being displayed mirrored horizontally. */
  mirrored: boolean;
}

export interface RenderInputs {
  /** The most recent video frame source. Renderers draw this as the base. */
  video: HTMLVideoElement;
  /** Latest vision result. May be null on the first few frames. */
  vision: VisionFrame | null;
}

/**
 * A garment renderer is responsible for compositing exactly one product
 * onto exactly one live video frame. The pipeline instantiates one
 * renderer per active product; switching products triggers `dispose()`
 * on the old renderer and constructs a new one via the registry.
 */
export interface TryOnRenderer {
  readonly product: Product;
  init(target: RenderTarget): Promise<void>;
  draw(target: RenderTarget, inputs: RenderInputs): void;
  dispose(): void;
}

export type TryOnRendererFactory = (product: Product) => TryOnRenderer;

/** Category-keyed renderer registry. */
export interface RendererRegistry {
  register<T extends TryOnAssets['kind']>(
    kind: T,
    factory: TryOnRendererFactory,
  ): void;
  create(product: Product): TryOnRenderer;
}
