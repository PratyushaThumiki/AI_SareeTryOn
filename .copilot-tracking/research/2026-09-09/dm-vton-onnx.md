---
title: DM-VTON student ONNX research
description: Research into obtaining or exporting a DM-VTON student ONNX model for the local virtual try-on contract
ms.date: 2026-09-09
ms.topic: reference
---

# DM-VTON Student ONNX Research

## Research Questions

* Does a downloadable ONNX model exist that matches the app contract?
* What prerequisites and commands are required if export is necessary?
* Is it safe to add an export script or placeholder to this repository?
* Does the app contract differ from the upstream model contract?

## Findings

### Availability

No official downloadable ONNX model matching the app contract was found. The
official DM-VTON repository is a PyTorch implementation. Its README points to
Google Drive for pretrained checkpoints, and its only GitHub release lists a
teacher FS-VTON checkpoint and a student DM-VTON checkpoint. The repository
contains no ONNX file or export script, and GitHub code search returned no
ONNX/export implementation.

The official checkpoint is split into two PyTorch files:

* `dmvton_pf_warp.pt`
* `dmvton_pf_gen.pt`

An independently maintained Hugging Face repository,
`saw235/dm-vton-weights`, mirrors those two `.pt` files. It has no model card,
no ONNX file, and no provider deployment, so it is a convenience mirror rather
than an official compatible artifact.

### Upstream Inference Contract

The upstream `DMVTONPipeline` is a two-stage pipeline, not one three-input
student graph. At the documented `256x192` tensor shape it accepts:

* `person`: `[1, 3, 256, 192]`, normalized to `[-1, 1]`
* `clothes`: `[1, 3, 256, 192]`, normalized to `[-1, 1]`
* `clothes_edge`: `[1, 1, 256, 192]`, thresholded to a binary mask

The warp checkpoint first produces a warped cloth and flow. The generator then
receives the concatenation of the person image, warped cloth, and warped edge,
which is seven channels, and produces four channels. The pipeline applies
`tanh` and `sigmoid`, composites the result, and returns `p_tryon` plus
`warped_cloth`.

The warp stage invokes a custom CuPy CUDA correlation autograd operator. The
operator raises `NotImplementedError` when tensors are not CUDA tensors. This
means a normal CPU-only Windows export is not a supported route.

### Export Prerequisites and Commands

The upstream-supported environment is Python 3.10, PyTorch 1.13.1,
torchvision 0.14.1, CuPy CUDA 11.x, and the repository's other requirements.
The practical environment is Linux or WSL2 with an NVIDIA GPU and a compatible
CUDA driver, rather than the current Windows installation with no Python.

The upstream setup and checkpoint preparation commands are:

```bash
git clone https://github.com/KiseKloset/DM-VTON.git
cd DM-VTON
conda create -n dm-vton python=3.10
conda activate dm-vton
bash scripts/install.sh
# Download the official pretrained files from the README's Google Drive link.
# Place them at checkpoints/dmvton_pf_warp.pt and checkpoints/dmvton_pf_gen.pt.
python test.py --project runs/test --name DM-VTON_demo --device 0 \
	--align_corners --batch_size 1 --workers 16 \
	--dataroot ../dataset/VITON-Clean/VITON_test \
	--pf_warp_checkpoint checkpoints/dmvton_pf_warp.pt \
	--pf_gen_checkpoint checkpoints/dmvton_pf_gen.pt
```

Those commands validate PyTorch inference only; upstream does not provide an
ONNX export command. A custom export would need a wrapper whose `forward`
accepts the three app names, calls the two-stage pipeline, returns only
`p_tryon`, and exports with fixed dummy inputs shaped `[1,3,256,192]`,
`[1,3,256,192]`, and `[1,1,256,192]`, for example:

```python
torch.onnx.export(
		wrapper.eval(),
		(person, cloth, cloth_mask),
		"dm-vton-student.onnx",
		input_names=["person_agnostic", "cloth", "cloth_mask"],
		output_names=["output"],
		opset_version=17,
)
```

This is only the final exporter call, not a known-working recipe. The custom
CuPy correlation function must first be replaced by an ONNX-exportable
implementation or decomposed into an equivalent supported graph. The exported
graph must then be numerically compared with PyTorch on representative VITON
inputs and loaded by `onnxruntime-web`; neither validation is supplied
upstream.

### Safety of Repository Changes

Adding a binary placeholder named `public/models/dm-vton-student.onnx` would be
unsafe and misleading: the browser loader would treat it as a real model, and
the repository has no compatible artifact to place there. Adding an export
script is safe only as clearly experimental tooling after the environment,
checkpoint provenance, custom correlation replacement, and validation steps are
specified. It should not be presented as a supported upstream export.

The upstream repository is licensed CC BY-NC-SA 4.0 and states that use is for
academic purposes. That restriction must be reviewed before bundling the
weights or an exported derivative in a commercial app.

## Evidence

* Local contract: `src/lib/vton/types.ts` declares `192x256`, inputs
	`person_agnostic`, `cloth`, `cloth_mask`, and output `output`.
* Local runtime: `src/lib/vton/VTONInference.ts` creates NCHW float tensors,
	normalizes RGB to `[-1, 1]`, normalizes the mask to `[0, 1]`, and loads one
	ONNX path with `onnxruntime-web`.
* Official source: <https://github.com/KiseKloset/DM-VTON>
* Official README/checkpoint link: <https://raw.githubusercontent.com/KiseKloset/DM-VTON/main/README.md>
* Official inference pipeline:
	<https://raw.githubusercontent.com/KiseKloset/DM-VTON/main/pipelines/dmvton_pipeline.py>
* Official test script:
	<https://raw.githubusercontent.com/KiseKloset/DM-VTON/main/test.py>
* Official model definitions:
	<https://raw.githubusercontent.com/KiseKloset/DM-VTON/main/models/warp_modules/mobile_afwm.py>
	and <https://raw.githubusercontent.com/KiseKloset/DM-VTON/main/models/generators/mobile_unet.py>
* Official custom correlation operator:
	<https://raw.githubusercontent.com/KiseKloset/DM-VTON/main/models/common/correlation.py>
* Official release: <https://github.com/KiseKloset/DM-VTON/releases/tag/1.0.0>
* Third-party checkpoint mirror:
	<https://huggingface.co/saw235/dm-vton-weights>
* Paper: <https://arxiv.org/abs/2308.13798>
* Relevant upstream issues document custom-input failures and unresolved
	real-time webcam usage: <https://github.com/KiseKloset/DM-VTON/issues/25>,
	<https://github.com/KiseKloset/DM-VTON/issues/26>, and
	<https://github.com/KiseKloset/DM-VTON/issues/27>.

## App Contract Mismatches

* **Graph structure:** the app assumes one ONNX file and one output; upstream
	supplies two checkpoints and a Python pipeline.
* **Person semantics:** the app passes a clothing-erased
	`person_agnostic` canvas. Upstream inference passes the original person
	image as `person`; the name and semantics are not equivalent.
* **Mask semantics:** the app's `cloth_mask` is structurally compatible with
	upstream's one-channel clothing edge, but upstream thresholds it and uses it
	as an edge mask. A generic binary garment mask may not reproduce that edge
	preprocessing.
* **Output naming:** upstream returns a composite tensor, not a tensor named
	`output`; naming can be added by a wrapper but is not evidence of model
	compatibility.
* **Domain:** the official model is trained/evaluated on VITON upper-body
	clothing. It does not model saree draping, pleats, or pallu behavior.
* **Preprocessing:** the app uses an approximate MediaPipe torso erase mask and
	has no SCHP/DensePose tensors. DM-VTON is parser-free, but its demonstrated
	inputs still rely on VITON-style person/cloth images and masks; quality with
	the app's camera frames is unverified.

## Follow-on Questions

* Can the custom CuPy correlation be replaced with a supported ONNX graph
	without changing numerical behavior or browser performance?
* Is the intended deployment academic/non-commercial under CC BY-NC-SA 4.0?
* Should the app contract be revised to expose the upstream two-stage pipeline,
	or should a different model designed for browser ONNX inference be selected?
