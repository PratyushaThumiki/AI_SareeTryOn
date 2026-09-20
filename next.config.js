/** @type {import('next').NextConfig} */

// Strict Content Security Policy.
//
// Highlights:
//   * default-src 'self'     — nothing loads by default except our own origin.
//   * connect-src            — the ONLY origins the app may talk to over the
//                              network. The MediaPipe CDN is allow-listed here
//                              because the vision models are downloaded from
//                              storage.googleapis.com/mediapipe-models. We do
//                              NOT allow-list any endpoint that could accept
//                              user image/video uploads.
//   * script-src             — 'unsafe-inline' is required because Next.js 14
//                              App Router injects inline <script> tags for its
//                              RSC (React Server Components) payload transfer.
//                              These scripts contain serialised JSON, not
//                              arbitrary code, but CSP has no way to distinguish
//                              that. 'wasm-unsafe-eval' is additionally required
//                              for MediaPipe's WebAssembly runtime.
//   * media-src 'self' blob:  — allow the local <video> element to play the
//                              local MediaStream. blob: never leaves the tab.
//   * img-src                 — self, data:, blob: (for local canvas exports),
//                              plus the product-asset CDN placeholder.
//   * frame-ancestors 'none'  — prevent clickjacking / iframe-driven upload.
//   * upgrade-insecure-requests — force HTTPS in production.
//
// If you change these directives, run `pnpm test` — the privacy tests assert
// that no unexpected origin ends up in connect-src.
//
// Dev vs production difference in script-src:
//   Dev only:  'unsafe-eval' — React Refresh (hot-reload) compiles modules
//              on the fly using eval(). Not present in production builds.
//   Both:      'unsafe-inline' — Next.js 14 RSC payload transfer uses inline
//              <script> tags (self.__next_f.push(...)). Required in both.
//   Both:      'wasm-unsafe-eval' — MediaPipe WASM runtime.
const isDev = process.env.NODE_ENV !== 'production';

const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net"
  : "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com https://cdn.jsdelivr.net",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://storage.googleapis.com https://cdn.jsdelivr.net",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join('; ');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            // Camera allowed on same-origin only. Everything else disabled.
            value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            // Required alongside COOP for SharedArrayBuffer (onnxruntime-web
            // multi-thread mode). Single-thread mode (numThreads: 1) does not
            // strictly require this, but it avoids console warnings in Chrome.
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
        ],
      },
    ];
  },
  webpack: (config) => {
    // MediaPipe ships .wasm alongside its JS. Ensure Webpack treats them as
    // assets rather than trying to parse.
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });

    // onnxruntime-web uses async WebAssembly imports internally.
    // Without this flag, Webpack throws "WebAssembly module is included in
    // initial chunk" and fails the build.
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    return config;
  },
};

module.exports = nextConfig;
