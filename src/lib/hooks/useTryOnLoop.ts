'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Product } from '@/lib/products/types';
import { createVisionPipeline, type VisionFrame, type VisionTimings } from '@/lib/vision';
import type { VisionPipeline } from '@/lib/vision/types';
import { createEngine, type TryOnEngine, type EngineStatus } from '@/lib/engine';
import type { RenderTarget } from '@/lib/renderer/types';

export type { EngineStatus };

export interface TryOnStats {
  fps: number;
  visionMs: number;
  renderMs: number;
}

export interface UseTryOnLoopOptions {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  product: Product | null;
  mirrored?: boolean;
  enabled?: boolean;
  onStats?: (stats: TryOnStats) => void;
  onVisionFrame?: (frame: VisionFrame) => void;
  onLoadingChange?: (loading: boolean) => void;
  /** Called whenever the active engine transitions to a new status. */
  onEngineStatus?: (status: EngineStatus) => void;
  onError?: (err: Error) => void;
}

/**
 * Manages the vision + render loop.
 *
 * Lifecycle:
 *   1. Pipeline init effect — one MediaPipe pipeline per component mount.
 *   2. Engine swap effect — disposes the old TryOnEngine and creates a fresh
 *      one whenever `product` changes. Phase 1 engine wraps the canvas renderer.
 *      Phase 2 engine will load model weights here.
 *   3. RAF loop — calls pipeline.process() then engine.draw() every frame.
 *
 * Phase 2 plug-in point:
 *   createEngine(product) in @/lib/engine/index.ts returns the Phase2 engine.
 *   This hook does not need to change.
 */
export function useTryOnLoop({
  videoRef,
  canvasRef,
  product,
  mirrored = true,
  enabled = true,
  onStats,
  onVisionFrame,
  onLoadingChange,
  onEngineStatus,
  onError,
}: UseTryOnLoopOptions) {
  // Stable refs for callbacks — updated every render, never in dep arrays.
  const onStatsRef = useRef(onStats);
  const onVisionFrameRef = useRef(onVisionFrame);
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onEngineStatusRef = useRef(onEngineStatus);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onStatsRef.current = onStats;
    onVisionFrameRef.current = onVisionFrame;
    onLoadingChangeRef.current = onLoadingChange;
    onEngineStatusRef.current = onEngineStatus;
    onErrorRef.current = onError;
  });

  const pipelineRef = useRef<VisionPipeline | null>(null);
  const engineRef = useRef<TryOnEngine | null>(null);
  const rafRef = useRef<number>(0);
  const frameCountRef = useRef(0);
  const fpsTimerRef = useRef(0);
  const lastVisionRef = useRef<VisionFrame | null>(null);

  const [pipelineReady, setPipelineReady] = useState(false);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');
  const [canGenerate, setCanGenerate] = useState(false);

  // ── 1. Pipeline init effect ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const pipeline = createVisionPipeline();
    pipelineRef.current = pipeline;

    onLoadingChangeRef.current?.(true);

    pipeline
      .init()
      .then(() => {
        if (!cancelled) {
          setPipelineReady(true);
          onLoadingChangeRef.current?.(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          onErrorRef.current?.(err instanceof Error ? err : new Error(String(err)));
          onLoadingChangeRef.current?.(false);
        }
      });

    return () => {
      cancelled = true;
      pipeline.dispose();
      pipelineRef.current = null;
      setPipelineReady(false);
    };
  }, []); // intentionally empty — one pipeline per mount lifetime

  // ── 2. Engine swap effect ────────────────────────────────────────────────
  // Runs whenever `product` changes. Disposes the old engine and initialises
  // a new one. The engine is NOT placed in engineRef until init() resolves,
  // so the RAF loop shows raw video during the loading window.
  useEffect(() => {
    engineRef.current?.dispose();
    engineRef.current = null;
    setCanGenerate(false);
    if (!product) return;

    const engine = createEngine(product);

    const unsubscribe = engine.subscribe(({ status, error }) => {
      setEngineStatus(status);
      onEngineStatusRef.current?.(status);
      if (error) onErrorRef.current?.(error);
    });

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const target: RenderTarget = canvas && ctx
      ? {
          canvas,
          ctx,
          width: canvas.width || canvas.clientWidth,
          height: canvas.height || canvas.clientHeight,
          dpr: window.devicePixelRatio || 1,
          mirrored: mirrored ?? true,
        }
      : (() => {
          const dummy = document.createElement('canvas');
          return {
            canvas: dummy,
            ctx: dummy.getContext('2d')!,
            width: 0,
            height: 0,
            dpr: 1,
            mirrored: mirrored ?? true,
          };
        })();

    engine.init(product, target).then(() => {
      engineRef.current = engine;
      setCanGenerate(engine.canGenerate);
    }).catch(() => {
      // Error already surfaced via subscribe above.
    });

    return () => {
      unsubscribe();
      engine.dispose();
    };
  }, [product, canvasRef, mirrored]);

  // ── 3. Render loop ───────────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    const pipeline = pipelineRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!pipeline || !video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frame = async (timestampMs: number) => {
      if (!video || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const displayW = canvas.clientWidth;
      const displayH = displayW * (vh / vw);
      const physW = Math.round(displayW * dpr);
      const physH = Math.round(displayH * dpr);
      if (canvas.width !== physW || canvas.height !== physH) {
        canvas.width = physW;
        canvas.height = physH;
      }

      const currentPipeline = pipelineRef.current;
      if (!currentPipeline) return;

      const target: RenderTarget = { canvas, ctx, width: physW, height: physH, dpr, mirrored };
      const rStart = performance.now();

      try {
        const visionFrame = await currentPipeline.process(video, timestampMs);
        lastVisionRef.current = visionFrame;
        onVisionFrameRef.current?.(visionFrame);
      } catch {
        // Vision failure doesn't kill the loop — just show the raw video.
      }

      const engine = engineRef.current;
      if (engine) {
        engine.draw(target, { video, vision: lastVisionRef.current });
      } else {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, physW, physH);
        if (mirrored) { ctx.translate(physW, 0); ctx.scale(-1, 1); }
        ctx.drawImage(video, 0, 0, physW, physH);
        ctx.restore();
      }

      const renderMs = performance.now() - rStart;
      frameCountRef.current++;
      const now = performance.now();
      if (now - fpsTimerRef.current >= 1000) {
        onStatsRef.current?.({
          fps: frameCountRef.current,
          visionMs: Math.round(currentPipeline.lastTimings().totalMs),
          renderMs: Math.round(renderMs),
        });
        frameCountRef.current = 0;
        fpsTimerRef.current = now;
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [videoRef, canvasRef, mirrored]);

  useEffect(() => {
    if (!pipelineReady || !enabled) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    const stop = startLoop();
    return () => {
      cancelAnimationFrame(rafRef.current);
      stop?.();
    };
  }, [pipelineReady, enabled, startLoop]);

  /**
   * Capture the current canvas frame and invoke the engine's neural try-on.
   * No-op if the engine is not ready, generating, or missing model weights.
   * The snapshot is taken locally — never uploaded.
   */
  const requestTryOn = useCallback(() => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;

    // Capture a snapshot of the canvas at this moment.
    const snapshot = document.createElement('canvas');
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    const sCtx = snapshot.getContext('2d');
    if (!sCtx) return;
    sCtx.drawImage(canvas, 0, 0);

    void engine.requestTryOn(snapshot);
  }, [canvasRef]);

  const clearResult = useCallback(() => {
    engineRef.current?.clearResult();
  }, []);

  return { pipelineReady, engineStatus, canGenerate, requestTryOn, clearResult };
}
