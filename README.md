<div align="center">
  <br />

  <div>
<img src="https://img.shields.io/badge/-TypeScript-3178C6?style=for-the-badge&logo=TypeScript&logoColor=white" />
<img src="https://img.shields.io/badge/-WebGPU-005A9C?style=for-the-badge&logo=WebGPU&logoColor=white" />
<img src="https://img.shields.io/badge/-Three.js-000000?style=for-the-badge&logo=Three.js&logoColor=white" />
<img src="https://img.shields.io/badge/-Firebase-FFCA28?style=for-the-badge&logo=Firebase&logoColor=black" />
<img src="https://img.shields.io/badge/-Python-3776AB?style=for-the-badge&logo=Python&logoColor=white" />
<img src="https://img.shields.io/badge/-PyTorch-EE4C2C?style=for-the-badge&logo=PyTorch&logoColor=white" />
<img src="https://img.shields.io/badge/-Google%20Cloud-4285F4?style=for-the-badge&logo=Google-Cloud&logoColor=white" />
  </div>

  <h3 align="center">Lumenary | Photorealistic 3D Environments in the Browser</h3>

  <div align="center">
     <a href="https://lumenary-fb.web.app" target="_blank"><b>lumenary-fb.web.app</b></a>
  </div>
</div>

---

## Table of Contents

1. [Introduction](#introduction)
2. [Pipeline](#pipeline)
3. [Why Botswana](#why-botswana)
4. [ROCm and Open Research](#rocm-and-open-research)
5. [Tech Stack](#tech-stack)
6. [Quick Start](#quick-start)

---

## Introduction

Lumenary is a browser-native viewer for photorealistic 3D environments. No plugins, no downloads — just a WebGPU-compatible browser and an internet connection.

The project uses 3D Gaussian Splatting (3DGS) to reconstruct real-world locations from drone and ground-level video footage. The result is a navigable 3D scene rendered client-side through a custom WebGPU engine written in WGSL. The renderer handles up to 2 million Gaussian splats per scene with depth sorting, LOD management, and spatial audio — all through compute shaders running on the GPU.

The first two scenes are the Okavango Delta and Gaborone City in Botswana.

---

## Pipeline

The GPU work happens during training, not rendering. Each scene goes through this pipeline:

**1. Frame extraction.** Drone footage is processed into filtered image sets — blur detection, deduplication, and temporal subsampling remove unusable frames before they reach the trainer.

**2. Camera pose estimation.** COLMAP runs structure-from-motion on the filtered image set to estimate camera positions and orientations.

**3. 3DGS training.** The Gaussian Splatting model trains for 30,000 iterations using differentiable Gaussian rasterization built on PyTorch. On a free-tier T4 (16 GB VRAM), a single scene takes 30–45 minutes at 1,600 px resolution.

**4. Export and serve.** The trained model exports as a `.ply` file (150–300 MB), uploaded to Google Cloud Storage and streamed directly into the browser renderer.

**5. Client-side rendering.** The WebGPU engine parses the PLY binary on the GPU, sorts splats by depth, and rasterizes them as view-aligned quads with Gaussian alpha falloff — all in real time.

---

## Why Botswana

The long-term goal is to cover every significant landmark in Botswana — working with museum directors, the Botswana Tourism Organisation, conservation authorities, and academic partners to source footage and clear rights.

After that, the plan is to expand across the SADC region using the same approach. At that scale, training easily runs into hundreds of jobs. Dedicated GPU access turns one scene a day into a dozen.

---

## ROCm and Open Research

There's a gap in the 3DGS ecosystem worth addressing. The core training stack — gaussian-splatting, diff-gaussian-rasterization, simple-knn, fused-ssim — was built for NVIDIA CUDA. ROCm support exists in principle, but there is very little documented guidance for getting a full 3DGS training run working end-to-end on AMD hardware: the correct compute capability flags, kernel compatibility in diff-gaussian-rasterization, and the full dependency chain.

Using the AMD Developer Cloud, the plan is to work through that and publish the findings openly. A working ROCm setup guide would give other researchers a reference they currently don't have.

---

## Tech Stack

**Client**
- **[TypeScript](https://www.typescriptlang.org/)** — application logic
- **[Vite](https://vitejs.dev/)** — build tool and dev server
- **[WebGPU](https://www.w3.org/TR/webgpu/)** — GPU compute and rendering
- **[WGSL](https://www.w3.org/TR/WGSL/)** — compute and rasterization shaders
- **[Three.js](https://threejs.org/)** — map scene renderer
- **[GSAP](https://gsap.com/)** — screen transitions and animations

**Backend & Infrastructure**
- **[Firebase](https://firebase.google.com/)** — authentication and Firestore
- **[Google Cloud Storage](https://cloud.google.com/storage)** — PLY file hosting
- **[Google Cloud Run](https://cloud.google.com/run)** — viewer deployment
- **[Vertex AI](https://cloud.google.com/vertex-ai)** — GPU training jobs
- **[nginx](https://nginx.org/)** — production serving

**Training**
- **[PyTorch](https://pytorch.org/)** — deep learning framework
- **[COLMAP](https://colmap.github.io/)** — structure-from-motion
- **[diff-gaussian-rasterization](https://github.com/graphdeco-inria/diff-gaussian-rasterization)** — CUDA rasterizer
- **[simple-knn](https://github.com/graphdeco-inria/simple-knn)** — nearest neighbor acceleration
- **[fused-ssim](https://github.com/graphdeco-inria/fused-ssim)** — SSIM kernel

---

## Quick Start

**Prerequisites**

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) v18+
- [npm](https://www.npmjs.com/)
- A browser with [WebGPU support](https://caniuse.com/webgpu) (Chrome 113+, Edge 113+)

**Clone**

```bash
git clone https://github.com/EDMND-SRC/Lumenary
cd Lumenary
```

**Install**

```bash
npm install
```

**Run**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a WebGPU-compatible browser.

**Build**

```bash
npm run build
```

Output goes to `dist/`.

---

## License

MIT