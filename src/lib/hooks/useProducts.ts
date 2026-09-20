'use client';

import { useEffect, useState } from 'react';
import type { Product } from '@/lib/products/types';

interface State {
  products: Product[];
  loading: boolean;
  error: Error | null;
}

export function useProducts(): State {
  const [state, setState] = useState<State>({ products: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/products')
      .then((r) => r.json() as Promise<{ products: Product[] }>)
      .then(({ products }) => {
        if (!cancelled) setState({ products, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled)
          setState({ products: [], loading: false, error: err instanceof Error ? err : new Error(String(err)) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
