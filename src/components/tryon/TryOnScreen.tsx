'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Product } from '@/lib/products/types';
import { CameraManager, type CameraStartResult, CameraDeniedError, NoCameraError } from '@/lib/camera';
import { useTryOnLoop, type TryOnStats } from '@/lib/hooks/useTryOnLoop';
import { useTryOnSession } from '@/lib/session';
import type { VisionFrame } from '@/lib/vision/types';
import { PrivacyBadge } from '@/components/ui/PrivacyBadge';
import { DebugPanel } from '@/components/ui/DebugPanel';
import { ProductCard } from '@/components/product/ProductCard';

type ErrorKind = 'denied' | 'no-camera' | 'no-local-ml' | 'unknown';

interface TryOnScreenProps {
  initialProduct: Product;
  catalog: Product[];
  onExit: () => void;
  debug?: boolean;
}

export function TryOnScreen({ initialProduct, catalog, onExit, debug = false }: TryOnScreenProps) {
  const { session, setProduct } = useTryOnSession(initialProduct);
  const product = session.product;
  const [cameraResult, setCameraResult] = useState<CameraStartResult | null>(null);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [error, setError] = useState<{ kind: ErrorKind; message: string } | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [stats, setStats] = useState<TryOnStats>({ fps: 0, visionMs: 0, renderMs: 0 });
  const [vision, setVision] = useState<VisionFrame | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef(new CameraManager());

  const startCamera = useCallback(async () => {
    try {
      const result = await cameraRef.current.start();
      setCameraResult(result);
      if (videoRef.current) {
        videoRef.current.srcObject = result.stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraStarted(true);
    } catch (e) {
      if (e instanceof CameraDeniedError) {
        setError({ kind: 'denied', message: e.message });
      } else if (e instanceof NoCameraError) {
        setError({ kind: 'no-camera', message: e.message });
      } else {
        setError({ kind: 'unknown', message: String(e) });
      }
    }
  }, []);

  const switchFacing = useCallback(async () => {
    try {
      const result = await cameraRef.current.switchFacing();
      setCameraResult(result);
      if (videoRef.current) {
        videoRef.current.srcObject = result.stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (e) {
      setError({ kind: 'unknown', message: String(e) });
    }
  }, []);

  // Snapshot — ONLY to local memory, never leaves device.
  const takeSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/jpeg', 0.88);
    setSnapshotUrl(url);
  }, []);

  const dismissSnapshot = useCallback(() => {
    setSnapshotUrl(null);
  }, []);

  useEffect(() => {
    void startCamera();
    return () => {
      void cameraRef.current.stop();
    };
  }, [startCamera]);

  const mirrored = cameraResult?.facing === 'user';

  const { pipelineReady, engineStatus, canGenerate, requestTryOn, clearResult } = useTryOnLoop({
    videoRef,
    canvasRef,
    product,
    mirrored,
    enabled: cameraStarted && !error,
    onStats: setStats,
    onVisionFrame: setVision,
    onLoadingChange: setPipelineLoading,
    onError: (e) => {
      setError({ kind: 'no-local-ml', message: e.message });
    },
  });

  const isGenerating = engineStatus === 'generating';
  const hasResult = engineStatus === 'result';
  const modelLoading = engineStatus === 'loading';
  const engineReady = engineStatus === 'ready' || hasResult;

  // ---- Render ----

  if (error) {
    return <ErrorFallback kind={error.kind} message={error.message} onBack={onExit} />;
  }

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-ink">
      {/* Hidden video element — exists only to receive the MediaStream.
          No image data is extracted from this element by any code in this
          file; it is passed by reference to the vision pipeline and renderer. */}
      <video
        ref={videoRef}
        muted
        playsInline
        className="hidden"
        aria-hidden="true"
      />

      {/* Live output canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Virtual try-on live view"
      />

      {/* Loading shimmer */}
      {(!cameraStarted || pipelineLoading) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink/80 backdrop-blur-sm">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-edge border-t-accent" />
          <p className="text-sm text-muted">
            {!cameraStarted ? 'Starting camera…' : 'Loading on-device vision models…'}
          </p>
          <PrivacyBadge />
        </div>
      )}

      {/* Top controls */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <PrivacyBadge className="pointer-events-auto" />

        <div className="pointer-events-auto flex gap-2">
          <ControlButton onClick={switchFacing} title="Switch camera" aria-label="Switch camera">
            <CameraRotateIcon />
          </ControlButton>
          <ControlButton onClick={onExit} title="Exit try-on" aria-label="Exit try-on">
            <XIcon />
          </ControlButton>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-6">

        {/* Current product name */}
        <div className="pointer-events-auto max-w-xs rounded-2xl bg-surface/80 px-5 py-3 text-center shadow-lg backdrop-blur-sm">
          <p className="text-xs uppercase tracking-widest text-muted">{product.subcategory ?? product.category}</p>
          <p className="mt-0.5 font-display text-lg font-semibold text-white">{product.name}</p>
        </div>

        {/* Engine status badge */}
        {modelLoading && (
          <div className="pointer-events-none rounded-full bg-amber-500/20 border border-amber-500/40 px-4 py-1 text-xs text-amber-300">
            Neural model loading… live preview active
          </div>
        )}
        {engineReady && !canGenerate && (
          <div className="pointer-events-none rounded-full bg-amber-500/20 border border-amber-500/40 px-4 py-1 text-xs text-amber-300">
            Neural model unavailable — live preview active
          </div>
        )}
        {isGenerating && (
          <div className="pointer-events-none flex items-center gap-2 rounded-full bg-accent/20 border border-accent/40 px-4 py-1 text-xs text-accent">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            Generating on-device…
          </div>
        )}

        {/* Generate Try-On button — only shown when engine is ready (not generating/loading) */}
        {!isGenerating && !hasResult && (
          <button
            onClick={requestTryOn}
            disabled={!engineReady || !canGenerate}
            className="pointer-events-auto rounded-full bg-accent px-7 py-3 text-sm font-semibold text-ink shadow-lg disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
            aria-label="Generate virtual try-on"
          >
            Generate Try-On
          </button>
        )}

        {/* Result actions */}
        {hasResult && (
          <div className="pointer-events-auto flex gap-3">
            <button
              onClick={takeSnapshot}
              className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-ink shadow active:scale-95 transition-all"
            >
              Save Result
            </button>
            <button
              onClick={clearResult}
              className="rounded-full border border-edge bg-surface/80 px-5 py-2 text-sm font-semibold text-white backdrop-blur-sm active:scale-95 transition-all"
            >
              Back to Live
            </button>
          </div>
        )}

        {/* Action row */}
        <div className="pointer-events-auto flex gap-3">
          <ControlButton onClick={() => setShowCatalog(true)} label="Change" />
          <ControlButton onClick={takeSnapshot} label="Snapshot" />
          <ControlButton onClick={() => setProduct(initialProduct)} label="Reset" />
        </div>

        {/* Debug panel */}
        {debug && pipelineReady && (
          <div className="pointer-events-none w-full max-w-xs rounded-xl bg-ink/70 px-4 py-2 backdrop-blur-sm">
            <DebugPanel stats={stats} vision={vision} />
          </div>
        )}
      </div>

      {/* Catalog drawer */}
      {showCatalog && (
        <div className="absolute inset-0 flex flex-col bg-ink/95 backdrop-blur-sm z-30">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="font-display text-xl font-semibold text-white">Change Saree</h2>
            <button
              onClick={() => setShowCatalog(false)}
              className="text-muted hover:text-white"
              aria-label="Close"
            >
              <XIcon />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-8">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {catalog.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onTryOn={(selected) => {
                    setProduct(selected);
                    setShowCatalog(false);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Snapshot modal — stays local to the browser tab */}
      {snapshotUrl && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink/90 backdrop-blur-sm z-40"
          role="dialog"
          aria-modal="true"
          aria-label="Snapshot preview"
        >
          <p className="text-xs text-privacyOk">🔒 Saved locally — not uploaded to any server</p>
          <img
            src={snapshotUrl}
            alt="Your try-on snapshot"
            className="max-h-[70vh] max-w-full rounded-2xl object-contain shadow-2xl"
          />
          <div className="flex gap-3">
            <a
              href={snapshotUrl}
              download="saree-tryon.jpg"
              className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-ink"
            >
              Save to device
            </a>
            <button
              onClick={dismissSnapshot}
              className="rounded-full border border-edge px-5 py-2 text-sm font-semibold text-white"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Sub-components ----

function ControlButton({
  onClick,
  title,
  label,
  children,
  'aria-label': ariaLabel,
}: {
  onClick: () => void;
  title?: string;
  label?: string;
  children?: React.ReactNode;
  'aria-label'?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={ariaLabel ?? label ?? title}
      className="flex items-center gap-1.5 rounded-full bg-surface/80 px-4 py-2 text-sm font-medium text-white shadow backdrop-blur-sm hover:bg-panel active:scale-95 transition-all"
    >
      {children}
      {label && <span>{label}</span>}
    </button>
  );
}

function ErrorFallback({ kind, message, onBack }: { kind: ErrorKind; message: string; onBack: () => void }) {
  const isPrivacyFallback = kind === 'no-local-ml';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ink p-8 text-center">
      <div className="text-4xl">{kind === 'denied' ? '📷' : kind === 'no-local-ml' ? '🔒' : '⚠️'}</div>
      <h1 className="font-display text-2xl font-semibold text-white">
        {kind === 'denied' && 'Camera Access Required'}
        {kind === 'no-camera' && 'No Camera Found'}
        {kind === 'no-local-ml' && 'On-Device Processing Unavailable'}
        {kind === 'unknown' && 'Something Went Wrong'}
      </h1>
      <p className="max-w-sm text-base text-muted">{message}</p>
      {isPrivacyFallback && (
        <div className="rounded-2xl border border-edge bg-panel px-6 py-4 text-left max-w-md">
          <p className="font-semibold text-white mb-2">🔒 Your privacy is protected</p>
          <p className="text-sm text-muted">
            Your device doesn&rsquo;t currently support local virtual try-on. Your camera image will
            not be uploaded. We do not offer a cloud-based fallback because we are committed to keeping
            your body image private.
          </p>
          <ul className="mt-3 list-disc pl-4 text-sm text-muted space-y-1">
            <li>Try Chrome or Edge on desktop for full WASM support.</li>
            <li>Enable hardware acceleration in browser settings.</li>
            <li>Update your browser to the latest version.</li>
          </ul>
        </div>
      )}
      <button
        onClick={onBack}
        className="rounded-full bg-accent px-6 py-2 font-semibold text-ink"
      >
        Back to catalog
      </button>
    </div>
  );
}

function XIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CameraRotateIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
