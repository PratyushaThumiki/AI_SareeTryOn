import type { Product } from '@/lib/products/types';
import { Phase2VTONEngine } from './Phase2VTONEngine';
import type { TryOnEngine } from './types';

export type { TryOnEngine, EngineStatus, EngineStatusEvent, EngineStatusListener } from './types';

/**
 * Factory — the single place that decides which engine implementation to use.
 *
 * Phase 2: Phase2VTONEngine wraps Phase1 for live preview + adds local ONNX inference.
 *          When /models/dm-vton-student.onnx is absent, reports 'ready' with
 *          generation disabled and falls back to Phase1 canvas overlay.
 */
export function createEngine(product: Product): TryOnEngine {
  return new Phase2VTONEngine(product);
}
