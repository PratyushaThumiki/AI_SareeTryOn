'use client';

import type { Product } from '@/lib/products/types';

interface ProductCardProps {
  product: Product;
  onTryOn: (product: Product) => void;
}

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function formatPrice(price: number, currency: string) {
  if (currency === 'INR') return INR.format(price);
  if (currency === 'USD') return USD.format(price);
  return `${currency} ${price}`;
}

export function ProductCard({ product, onTryOn }: ProductCardProps) {
  const thumb = product.images[0];

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-edge bg-panel transition-all hover:border-accent/50 hover:shadow-lg hover:shadow-accent/10">
      {/* Garment preview */}
      <div className="relative aspect-[5/8] w-full overflow-hidden bg-surface">
        {thumb && (
          <img
            src={thumb.src}
            alt={thumb.alt ?? product.name}
            width={thumb.width ?? 400}
            height={thumb.height ?? 640}
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
          />
        )}
        {/* Category badge */}
        <span className="absolute left-3 top-3 rounded-full bg-ink/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted backdrop-blur-sm">
          {product.subcategory ?? product.category}
        </span>
        {/* Fabric */}
        {product.fabric && (
          <span className="absolute right-3 top-3 rounded-full bg-ink/70 px-2 py-0.5 text-[10px] text-muted backdrop-blur-sm">
            {product.fabric}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted">{product.brand}</p>
          <h3 className="mt-0.5 font-display text-base font-semibold leading-snug text-white">
            {product.name}
          </h3>
        </div>

        {/* Color swatches */}
        <div className="flex gap-1.5">
          {product.colors.slice(0, 4).map((c) => (
            <span
              key={c.hex}
              title={c.name ?? c.hex}
              className="h-4 w-4 rounded-full border border-white/20"
              style={{ background: c.hex }}
            />
          ))}
        </div>

        <div className="flex items-center justify-between mt-auto">
          <span className="text-lg font-semibold text-accent">
            {formatPrice(product.price, product.currency)}
          </span>
          <button
            onClick={() => onTryOn(product)}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-accentDim active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Try On
          </button>
        </div>
      </div>
    </article>
  );
}
