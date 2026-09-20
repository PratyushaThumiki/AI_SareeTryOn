'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Product } from '@/lib/products/types';
import { useProducts } from '@/lib/hooks/useProducts';
import { ProductCard } from '@/components/product/ProductCard';
import { TryOnScreen } from '@/components/tryon/TryOnScreen';

type Screen = 'catalog' | 'tryon';

export default function Home() {
  const { products, loading, error } = useProducts();
  const [screen, setScreen] = useState<Screen>('catalog');
  const [active, setActive] = useState<Product | null>(null);
  const debug = process.env.NODE_ENV === 'development';

  const handleTryOn = (product: Product) => {
    setActive(product);
    setScreen('tryon');
  };

  const handleExit = () => {
    setScreen('catalog');
    setActive(null);
  };

  if (screen === 'tryon' && active) {
    return (
      <TryOnScreen
        initialProduct={active}
        catalog={products}
        onExit={handleExit}
        debug={debug}
      />
    );
  }

  return (
    <main className="min-h-screen bg-ink pb-16">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-edge bg-ink/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div>
            <h1 className="font-display text-xl font-semibold text-white">Virtual Try-On</h1>
            <p className="text-xs text-muted">Powered entirely on your device</p>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/privacy"
              className="text-sm text-muted hover:text-white transition-colors"
            >
              🔒 Privacy
            </Link>
          </nav>
        </div>
      </header>

      {/* Privacy notice bar */}
      <div className="bg-panel border-b border-edge py-2 px-5">
        <div className="mx-auto max-w-6xl flex items-center justify-center gap-2 text-xs text-privacyOk">
          <span>🔒</span>
          <span>Camera processed on this device — your image is never uploaded</span>
        </div>
      </div>

      {/* Catalog grid */}
      <div className="mx-auto max-w-6xl px-5 pt-8">
        <div className="mb-6">
          <h2 className="font-display text-2xl font-semibold text-white">Saree Collection</h2>
          <p className="mt-1 text-sm text-muted">
            Select any saree and try it on instantly — no registration, no upload.
          </p>
        </div>

        {loading && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="aspect-[5/8] rounded-2xl skeleton" />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-edge bg-panel p-6 text-center">
            <p className="text-muted">Failed to load products. Please refresh.</p>
            <p className="mt-1 text-xs text-danger">{error.message}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} onTryOn={handleTryOn} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
