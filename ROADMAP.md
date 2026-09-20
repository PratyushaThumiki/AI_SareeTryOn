# Product Roadmap: Virtual Saree Try-On

## Architecture Principle

Keep these responsibilities separated at all times:

```
CameraStream      — raw video feed, device permission, stream lifecycle
BodyTracker       — pose keypoints, body segmentation, body parsing
TryOnSession      — selected product, session state, phase coordination
Garment/ProductData — catalogue, assets (body/border/pallu/blouse), metadata
TryOnEngine       — transforms (product + body state) → render instructions
TryOnRenderer     — draws render instructions onto the canvas output
```

The `TryOnEngine` is the component that will be replaced in Phase 2.
Everything else should survive that replacement intact.

---

## Phase 1 — Live Camera Foundation [CURRENT]

**Status: In progress**

### What Phase 1 delivers

```
Catalogue
  → user selects a saree
  → user taps TRY ON
  → camera opens
  → live camera stream (device camera)
  → local body/pose tracking (MediaPipe — on-device, no upload)
  → selected saree attached to the try-on session
  → visible feedback that the session is active with the right product
```

### What Phase 1 does NOT deliver

- Photorealistic virtual draping
- Realistic garment synthesis
- Neural VTON output
- Any form of image generation

### Phase 1 TryOnEngine

The Phase 1 engine is a **temporary visualization only**. Its job is to confirm
that the camera, body tracker, and product data are all connected. It may show:

- Body region highlighting (coloured overlay in the saree's primary colour)
- Pose skeleton (for debugging body tracking)
- Saree name/info panel anchored to the session

This output will look nothing like a person wearing a saree. That is intentional.
Phase 1 proves the pipeline works. Phase 2 replaces the engine with real synthesis.

### Architectural constraint

The Phase 1 renderer MUST be replaceable by a Phase 2 engine with no changes
to CameraStream, BodyTracker, TryOnSession, or ProductData.

---

## Phase 2 — Realistic Garment Try-On [FUTURE]

Replace the Phase 1 visualization with an actual garment synthesis system.

### Target output

> "This person is actually wearing this saree."
> NOT: "Four saree images were placed over this person."

### Garment asset model

The four catalogue assets per saree are **structured garment inputs**, not images
to be displayed:

| Asset  | Role as conditioning input |
|--------|---------------------------|
| `body.jpg`   | Fabric texture, weave pattern, colour |
| `border.jpg` | Border geometry, width, texture, material |
| `pallu.jpg`  | Pallu panel appearance, drape direction |
| `blouse.jpg` | Blouse cut, sleeve style, fabric, colour |

These must be treated as inputs to a synthesis model, not as layers to composite.

### Acceptance criterion

A person who knows nothing about the implementation looks at the output and says:
**"That person is wearing this saree."**

They should NOT say: *"Someone put four images over that person's body."*

### Technologies under investigation (not yet chosen)

- Mobile-VTON (CVPR 2026) — feasibility experiment in /experiments/mobile-vton/
- Saree-specific VTON fine-tuning
- Diffusion-based VTON (IDM-VTON, CatVTON, OOTDiffusion)
- Garment deformation models
- Neural rendering
- Hybrid garment geometry + neural rendering

**Decision deferred until /experiments/mobile-vton/ feasibility results are in.**

### Privacy requirement (non-negotiable, all phases)

- Camera frames never leave the device
- No customer photo uploaded to any server
- No customer video uploaded to any server
- All inference runs locally
- No biometric embeddings stored or transmitted

---

## Phase 3 — Mobile / On-Device Neural Inference [FUTURE]

Move the Phase 2 synthesis engine onto the customer's device.

### Requirements

- iOS: CoreML conversion of the synthesis model
- Android: ONNX Runtime Mobile + NNAPI backend
- Model compression / quantization (target: fits in device RAM + runs in <30s)
- No cloud dependency for the try-on step
- Camera data never leaves the device (extends Phase 1/2 privacy guarantee)

### UX model for Phase 3

```
User positions themselves in frame (live camera — Phase 1 stream)
   ↓
User taps "Generate Try-On"
   ↓
One frame captured locally
   ↓
On-device pipeline:
   body parser (ONNX) → semantic body map
   → synthesis engine (CoreML/ONNX) → try-on image
   ↓
Result displayed (5–30 seconds latency, single image)
   ↓
User browses other sarees, repeats
```

This is "capture and process", not a live video mirror.

---

## Phase 4 — Streaming / Temporal Experience [FUTURE]

Move from capture-and-process toward a live virtual mirror feel.

### Target experience

```
Live camera
  → continuous body tracking
  → temporally stable garment rendering
  → smooth movement
  → realistic saree appearance
```

### Architecture for Phase 4

True photorealistic neural VTON at 30 FPS is not currently feasible on consumer
devices. Phase 4 may use a hybrid architecture:

- Real-time local tracking (body landmarks + segmentation — already Phase 1)
- Garment deformation: deform a pre-generated neural result to follow body movement
- Cached/generated neural results: periodically refresh the neural output in background
- Temporal consistency: blend deformed result with new neural result when ready
- Neural refinement: optional per-frame lightweight refinement pass

---

## Phase 5 — Generalise Beyond Sarees [FUTURE]

Extend the TryOnEngine to support additional garment categories.

### Target categories

Sarees are first and hardest. Later:
- Dresses
- Shirts / blouses
- Pants / lehengas
- Jackets / dupattas
- Jewellery / accessories

### Architectural implication

The `TryOnEngine` interface must be garment-category-aware from Phase 1.
The `SareeTryOnAssets` type already exists. Future types:
`DressTryOnAssets`, `JewelleryTryOnAssets`, etc. — all served by the same
`TryOnSession` + `CameraStream` infrastructure.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-09 | Canvas 2D overlay approach abandoned as final output | Confirmed architecturally incapable of producing realistic draping |
| 2026-09-09 | Phase 2 technology deferred | Pending Mobile-VTON feasibility experiment results |
| 2026-09-09 | Cloud VTON APIs ruled out | Privacy requirement: customer camera data never leaves device |
| 2026-09-09 | Phase 1 scope locked to camera + tracking + session, no synthesis | Avoids coupling camera pipeline to a renderer that will be replaced |
