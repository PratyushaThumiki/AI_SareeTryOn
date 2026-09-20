# Virtual Try-On MVP

A privacy-first, on-device virtual try-on platform. The first category is **sarees**, but the architecture supports any physical product (dresses, jewelry, glasses, shoes, accessories).

---

## Core privacy guarantee

> **Your camera feed stays on your device and is never uploaded.**

This is a *technical* guarantee, not just a policy statement:

- There is no server endpoint that accepts images or video.
- All computer vision (pose estimation, person segmentation) runs in your browser via WebAssembly.
- The backend serves only product metadata and garment images.
- A strict Content Security Policy header blocks any unexpected network calls.
- In development, a `NetworkGuard` component monkey-patches `fetch`/`XHR`/`WebSocket` and will show a visible red alert if any code attempts to send image data over the network.

---

## Architecture

```
BROWSER (your device)
│
├── Camera Manager ─────────────────────────── MediaDevices API (local only)
│                                               Camera stream NEVER leaves this box
│
├── Vision Pipeline (on-device WASM)
│   ├── Pose Landmarker ──────────────────── MediaPipe Tasks Vision (Apache 2.0)
│   │   └─ 33-point body landmarks           Downloads model once, runs locally
│   └── Image Segmenter
│       └─ Person mask (Float32Array)
│
├── Garment Renderer
│   ├── SareeRenderer ───────────────────── Canvas 2D + affine strip-warp
│   └── [future] DressRenderer / JewelryRenderer / etc.
│
└── Output Canvas ───────────────────────────── Composited live preview

SERVER (our backend)
│
├── GET /api/products ──── Product catalog (SKU, name, price, colors, fabric)
└── Product images ─────── Garment SVG/PNG assets (NOT camera images)
     NOTE: server never receives or stores any camera data
```

### Local vs. server processing

| Operation                        | Where it runs  | Notes                                         |
|----------------------------------|----------------|-----------------------------------------------|
| Camera stream access             | Browser only   | `getUserMedia`, never serialized or sent      |
| Pose estimation                  | Browser (WASM) | MediaPipe PoseLandmarker, GPU delegate        |
| Person segmentation              | Browser (WASM) | MediaPipe ImageSegmenter, GPU delegate        |
| Garment affine warp + composite  | Browser canvas | Pure Canvas 2D, no GPU API needed             |
| Product catalog fetch            | Server → client| Only product metadata; zero camera data       |
| Garment image assets             | Server → client| SVG data-URIs in MVP; CDN in production       |
| Snapshots (optional)             | Browser only   | canvas.toDataURL, saved locally, not uploaded |
| Analytics / telemetry            | None           | Not implemented                               |

---

## Technology choices

### Vision: MediaPipe Tasks Vision `@mediapipe/tasks-vision`
- **Why:** Ships both pose landmarks (33-point body) and person segmentation in a single package; runs 100% on-device via WASM + optional WebGL GPU delegate; Apache 2.0 license; actively maintained in 2026; no cloud fallback.
- **Alternatives considered:** TF.js MoveNet (pose-only, no segmentation), ONNX Runtime Web (heavier setup, requires hand-sourcing models), Transformers.js (good segmentation but slower inference for real-time video).

### Rendering: Canvas 2D with N-slice affine warp
- **Why:** Universal support, no extra dependencies, sufficient quality for MVP.
- **Future path:** WebGL/WebGPU 3D mesh rendering, ONNX neural garment flow, on-device diffusion VTON.

### Frontend: Next.js 14 App Router + TypeScript + Tailwind

### Backend: Next.js API routes (in-memory for MVP, swap to PostgreSQL for production)

---

## Setup

### Prerequisites
- Node 18.17+ or 20+
- npm / pnpm / yarn

### Install

```bash
npm install
```

### Run in development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The `NetworkGuard` privacy monitor is active in development.

### Run tests

```bash
npm test
```

### Run privacy audit (static analysis)

```bash
npm run audit:privacy
```

### Build for production

```bash
npm run build
npm start
```

---

## Project structure

```
src/
  app/
    page.tsx              — Catalog + try-on root (client)
    privacy/page.tsx      — Privacy policy page
    api/products/         — Product API routes (GET only)
    layout.tsx            — Root layout; injects NetworkGuard in dev
    globals.css
  lib/
    products/
      types.ts            — Product & TryOnAssets type definitions
      seed.ts             — 10 fictional sarees (inline SVG assets)
      repository.ts       — In-memory product store (swap for DB)
      svg.ts              — Procedural saree SVG generator
    vision/
      types.ts            — VisionPipeline interface + VisionFrame
      capability.ts       — Browser feature detection
      MediaPipeVisionPipeline.ts — On-device pose + segmentation
      index.ts            — Factory
    renderer/
      types.ts            — TryOnRenderer interface + RenderTarget
      GarmentRegistry.ts  — Category-keyed renderer registry
      SareeRenderer.ts    — MVP saree garment renderer
      warp.ts             — N-slice affine quad warp helper
      index.ts
    camera/
      CameraManager.ts    — MediaStream lifecycle (no uploads)
      index.ts
    hooks/
      useTryOnLoop.ts     — Frame loop hook (vision → render)
      useProducts.ts      — Product catalog fetcher
  components/
    dev/NetworkGuard.tsx  — Dev-only privacy monitor
    product/ProductCard.tsx
    tryon/TryOnScreen.tsx — Full-screen try-on experience
    ui/PrivacyBadge.tsx
    ui/DebugPanel.tsx
tests/
  setup.ts                — jsdom stub for MediaDevices
  privacy.test.ts         — Privacy guarantee tests
  renderer.test.ts        — Renderer contract tests
scripts/
  audit-privacy.mjs       — Static pattern analysis for exfiltration risk
```

---

## Extending to other product categories

1. Add a new variant to `TryOnAssets` in [`src/lib/products/types.ts`](src/lib/products/types.ts).
2. Write a renderer implementing `TryOnRenderer` in `src/lib/renderer/`.
3. Register it in [`GarmentRegistry.ts`](src/lib/renderer/GarmentRegistry.ts):
   ```ts
   reg.register('dress', (p) => new DressRenderer(p));
   ```
4. Add seed data for the new category.
5. The try-on loop and product catalog update automatically — no other changes needed.

---

## Privacy audit checklist

Run before every release:

- [ ] `npm run audit:privacy` — exits 0
- [ ] `npm test` — all tests pass
- [ ] `Content-Security-Policy` header reviewed in `next.config.js`
- [ ] No new `connect-src` origins added without justification
- [ ] `NetworkGuard` tested manually: open app in dev, no red violation overlay appears during normal use
- [ ] Privacy page (`/privacy`) accurately describes all processing
