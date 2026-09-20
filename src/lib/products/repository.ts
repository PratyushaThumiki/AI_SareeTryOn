import type { Product } from './types';
import { seedProducts } from './seed';

/**
 * The MVP ships an in-memory repository backed by the seed catalog. Swap
 * this out for a Postgres-backed implementation without changing callers —
 * only these three functions are used by the API route and the UI.
 *
 * Nothing in this file touches the camera, DOM, or user personal data.
 */

export function listProducts(): Product[] {
  return seedProducts();
}

export function getProduct(id: string): Product | undefined {
  return seedProducts().find((p) => p.id === id);
}

export function listCategories(): string[] {
  return Array.from(new Set(seedProducts().map((p) => p.category)));
}
