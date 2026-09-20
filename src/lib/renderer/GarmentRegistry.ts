import type { Product, SareeTryOnAssets, TryOnAssets } from '@/lib/products/types';
import type { RendererRegistry, TryOnRenderer, TryOnRendererFactory } from './types';
import { SareeRenderer } from './SareeRenderer';
import { MultiPartSareeRenderer } from './MultiPartSareeRenderer';

class DefaultRegistry implements RendererRegistry {
  private factories = new Map<TryOnAssets['kind'], TryOnRendererFactory>();

  register<T extends TryOnAssets['kind']>(kind: T, factory: TryOnRendererFactory): void {
    this.factories.set(kind, factory);
  }

  create(product: Product): TryOnRenderer {
    const kind = product.tryOnAssets.kind;
    const factory = this.factories.get(kind);
    if (!factory) {
      throw new Error(`No renderer registered for category kind: ${kind}`);
    }
    return factory(product);
  }
}

let singleton: RendererRegistry | null = null;

/**
 * Global registry. Sarees register out-of-the-box; the factory auto-selects
 * MultiPartSareeRenderer when the product has a `parts` image set, or falls
 * back to SareeRenderer for legacy SVG-based products. Dress/jewelry/glasses/
 * shoes renderers are added later by importing them for their side effect.
 */
export function getRegistry(): RendererRegistry {
  if (!singleton) {
    const reg = new DefaultRegistry();
    reg.register('saree', (p) => {
      const assets = p.tryOnAssets as SareeTryOnAssets;
      return assets.parts ? new MultiPartSareeRenderer(p) : new SareeRenderer(p);
    });
    singleton = reg;
  }
  return singleton;
}
