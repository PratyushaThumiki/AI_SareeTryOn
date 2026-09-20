/**
 * Renderer contract tests.
 * These run in jsdom, so we need to stub canvas APIs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal canvas stub for jsdom
function makeCanvas() {
  const canvas = {
    width: 640,
    height: 480,
    clientWidth: 640,
    clientHeight: 480,
    getContext: vi.fn(() => ({
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
      setTransform: vi.fn(),
      putImageData: vi.fn(),
    })),
  };
  return canvas as unknown as HTMLCanvasElement;
}

describe('SareeRenderer', () => {
  it('throws if given a non-saree product', async () => {
    const { SareeRenderer } = await import('@/lib/renderer');
    const { seedProducts } = await import('@/lib/products/seed');
    const saree = seedProducts()[0]!;
    // Should not throw
    expect(() => new SareeRenderer(saree)).not.toThrow();
  });

  it('disposes without error', async () => {
    const { SareeRenderer } = await import('@/lib/renderer');
    const { seedProducts } = await import('@/lib/products/seed');
    const renderer = new SareeRenderer(seedProducts()[0]!);
    expect(() => renderer.dispose()).not.toThrow();
  });
});

describe('GarmentRegistry extensibility', () => {
  it('can register a custom renderer kind', async () => {
    const { getRegistry } = await import('@/lib/renderer');
    const { seedProducts } = await import('@/lib/products/seed');
    const reg = getRegistry();

    // Register a stub dress renderer
    reg.register('dress', (p) => ({
      product: p,
      init: vi.fn().mockResolvedValue(undefined),
      draw: vi.fn(),
      dispose: vi.fn(),
    }));

    // Build a minimal valid DressTryOnAssets product (just for registry lookup).
    const saree = seedProducts()[0]!;
    const dressProd = {
      ...saree,
      tryOnAssets: {
        kind: 'dress' as const,
        front: { src: 'data:image/svg+xml,test' },
        sleeve: 'sleeveless' as const,
        neckline: 'round' as const,
        anchors: saree.tryOnAssets.kind === 'saree' ? saree.tryOnAssets.anchors : {
          shoulderLine: { left: [0.2, 0.1] as [number, number], right: [0.8, 0.1] as [number, number] },
          waist: { left: [0.2, 0.5] as [number, number], right: [0.8, 0.5] as [number, number] },
          hem: { left: [0.1, 0.9] as [number, number], right: [0.9, 0.9] as [number, number] },
        },
      },
    };
    expect(() => reg.create(dressProd)).not.toThrow();
  });

  it('throws for unregistered kind', async () => {
    const { getRegistry } = await import('@/lib/renderer');
    const { seedProducts } = await import('@/lib/products/seed');
    const saree = seedProducts()[0]!;
    // Build a minimal valid ShoesTryOnAssets product.
    const shoesProd = {
      ...saree,
      tryOnAssets: {
        kind: 'shoes' as const,
        image: { src: 'data:image/svg+xml,shoe' },
        fits: 'flat' as const,
      },
    };
    // 'shoes' renderer is not yet registered.
    expect(() => {
      const reg = getRegistry();
      reg.create(shoesProd);
    }).toThrow(/No renderer registered for category kind: shoes/);
  });
});
