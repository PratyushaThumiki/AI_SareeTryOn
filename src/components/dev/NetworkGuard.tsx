'use client';

import { useEffect, useState } from 'react';

interface Violation {
  id: number;
  timestamp: string;
  method: string;
  url: string;
  details: string;
}

let violationCount = 0;
const listeners = new Set<(v: Violation) => void>();

function dispatchViolation(v: Violation) {
  listeners.forEach((fn) => fn(v));
  // Only emit to console, never to a remote endpoint.
  // eslint-disable-next-line no-console
  console.error('[NetworkGuard] PRIVACY VIOLATION DETECTED', v);
}

/**
 * Install one-time patches. Safe to call multiple times (idempotent).
 */
let patched = false;
function installPatches() {
  if (patched || typeof window === 'undefined') return;
  patched = true;

  // ---- fetch ----
  const origFetch = window.fetch.bind(window);
  window.fetch = async function guardedFetch(input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = (init?.body ?? null) as unknown;
    if (looksLikeCameraData(body)) {
      const v: Violation = {
        id: ++violationCount,
        timestamp: new Date().toISOString(),
        method: 'fetch',
        url,
        details: describeBody(body),
      };
      dispatchViolation(v);
    }
    return origFetch(input, init);
  };

  // ---- XMLHttpRequest ----
  const OrigXHR = window.XMLHttpRequest;
  class GuardedXHR extends OrigXHR {
    private _url = '';
    open(method: string, url: string, ...rest: unknown[]) {
      this._url = url;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (super.open as any)(method, url, ...rest);
    }
    send(body?: Document | XMLHttpRequestBodyInit | null) {
      if (looksLikeCameraData(body)) {
        const v: Violation = {
          id: ++violationCount,
          timestamp: new Date().toISOString(),
          method: 'XMLHttpRequest',
          url: this._url,
          details: describeBody(body),
        };
        dispatchViolation(v);
      }
      return super.send(body);
    }
  }
  window.XMLHttpRequest = GuardedXHR as typeof XMLHttpRequest;

  // ---- WebSocket ----
  const OrigWS = window.WebSocket;
  class GuardedWS extends OrigWS {
    send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      if (looksLikeCameraData(data)) {
        const v: Violation = {
          id: ++violationCount,
          timestamp: new Date().toISOString(),
          method: 'WebSocket',
          url: this.url,
          details: describeBody(data),
        };
        dispatchViolation(v);
      }
      return super.send(data);
    }
  }
  window.WebSocket = GuardedWS as typeof WebSocket;
}

/**
 * Heuristic: does this body look like it could be a camera frame?
 *
 * We detect:
 *   * Blob with image/video MIME type
 *   * ArrayBuffer / TypedArray > 50 KB (raw pixel data is large)
 *   * FormData with a Blob field
 *   * String starting with data:image or data:video
 *
 * This is intentionally conservative to catch accidents without false
 * positives from legitimate binary data (e.g., WASM downloads).
 */
function looksLikeCameraData(body: unknown): boolean {
  if (body instanceof Blob && /^(image|video)\//.test(body.type)) return true;
  if (body instanceof ArrayBuffer && body.byteLength > 50_000) return true;
  if (ArrayBuffer.isView(body) && body.byteLength > 50_000) return true;
  if (body instanceof FormData) {
    let found = false;
    body.forEach((value) => {
      if (value instanceof Blob && /^(image|video)\//.test(value.type)) found = true;
    });
    return found;
  }
  if (typeof body === 'string') {
    return /^data:(image|video)\//.test(body);
  }
  return false;
}

function describeBody(body: unknown): string {
  if (body instanceof Blob) return `Blob(type=${body.type}, size=${body.size})`;
  if (body instanceof ArrayBuffer) return `ArrayBuffer(byteLength=${body.byteLength})`;
  if (ArrayBuffer.isView(body)) return `TypedArray(byteLength=${body.byteLength})`;
  if (body instanceof FormData) return 'FormData(...)';
  if (typeof body === 'string') return `string(${body.slice(0, 40)}...)`;
  return String(body);
}

/**
 * The NetworkGuard component only renders in development (controlled by
 * the layout). It shows a badge and, if violations are detected, a
 * prominent overlay listing them.
 */
export function NetworkGuard() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    installPatches();
    const handler = (v: Violation) => {
      setViolations((prev) => [v, ...prev]);
      setExpanded(true);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  return (
    <>
      {/* Always-visible badge in development */}
      <div
        style={{ position: 'fixed', bottom: 8, left: 8, zIndex: 9999, pointerEvents: 'none' }}
        className="rounded-md bg-ink/80 px-2 py-1 text-[10px] font-mono text-muted border border-edge"
        role="status"
        aria-label="NetworkGuard active"
      >
        {violations.length === 0 ? '🛡️ NetworkGuard: no violations' : `⛔ NetworkGuard: ${violations.length} VIOLATION(S)`}
      </div>

      {/* Violation overlay */}
      {violations.length > 0 && expanded && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.85)' }}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="ng-title"
          className="flex items-center justify-center p-6"
        >
          <div className="max-w-lg w-full rounded-2xl border border-danger/40 bg-surface p-6 shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <h2 id="ng-title" className="text-danger font-semibold text-lg">
                ⛔ Privacy Violation Detected
              </h2>
              <button onClick={() => setExpanded(false)} className="text-muted hover:text-white">✕</button>
            </div>
            <p className="text-sm text-muted mb-4">
              The application attempted to send what appears to be camera/image data over the
              network. This is a bug — review the stack trace in the console.
            </p>
            <ul className="space-y-3 max-h-64 overflow-y-auto">
              {violations.map((v) => (
                <li key={v.id} className="rounded-lg bg-panel p-3 text-xs font-mono">
                  <div className="text-danger font-semibold">{v.method}</div>
                  <div className="text-muted truncate">{v.url}</div>
                  <div className="text-edge mt-1">{v.details}</div>
                  <div className="text-edge">{v.timestamp}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
