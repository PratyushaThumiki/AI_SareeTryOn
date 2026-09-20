import type { Product } from '@/lib/products/types';

/**
 * The production phase the try-on experience is currently running at.
 * Used for documentation and future feature-gating — does not change
 * CameraStream, BodyTracker, or ProductData behaviour.
 */
export type ProductionPhase = 'phase1' | 'phase2' | 'phase3' | 'phase4';

/**
 * Session state for a single try-on session.
 *
 * A session begins when the user taps "Try On" on a product card
 * and ends when they exit back to the catalogue.
 *
 * phase1: canvas placeholder visualization (current)
 * phase2: neural garment synthesis (future)
 * phase3: on-device mobile inference (future)
 * phase4: temporally stable live rendering (future)
 */
export interface TryOnSessionState {
  /** The product currently being tried on. May change mid-session via the drawer. */
  product: Product;
  /** Which capability phase this session is running. */
  phase: ProductionPhase;
}
