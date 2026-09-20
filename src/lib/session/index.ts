'use client';

import { useState } from 'react';
import type { Product } from '@/lib/products/types';
import type { ProductionPhase, TryOnSessionState } from './types';

export type { TryOnSessionState, ProductionPhase };

/** Current capability phase — advance this in createEngine() when Phase 2 lands. */
const CURRENT_PHASE: ProductionPhase = 'phase1';

export interface UseTryOnSessionResult {
  session: TryOnSessionState;
  /** Replace the active product (e.g. from the in-session catalogue drawer). */
  setProduct: (product: Product) => void;
}

/**
 * Manages try-on session state.
 *
 * Replaces the split between page.tsx `active` state and TryOnScreen's local
 * `product` useState. All product-identity decisions for the session go here.
 *
 * Phase 2 can extend this hook with: generation status, result images,
 * try-on history — without touching CameraStream or TryOnScreen layout.
 */
export function useTryOnSession(initialProduct: Product): UseTryOnSessionResult {
  const [product, setProduct] = useState<Product>(initialProduct);

  return {
    session: {
      product,
      phase: CURRENT_PHASE,
    },
    setProduct,
  };
}
