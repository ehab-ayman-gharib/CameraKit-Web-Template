# CameraKit Web Template

A modern React + TypeScript + Vite web template for building browser-based AR camera experiences with **Snap Camera Kit** (`@snap/camera-kit`).

## Features

- **Live AR Camera Session**: Bootstraps Snap Camera Kit (`bootstrapCameraKit`), renders lenses to a full-screen `<canvas>`, and streams from `navigator.mediaDevices.getUserMedia` with automatic front-camera mirroring (`Transform2D.MirrorX`).
- **Camera Flip**: Switch between front (`user`) and rear (`environment`) cameras.
- **Photo Capture**: Tap the shutter button to capture a PNG from the AR canvas with flash animation, shutter sound (`/sounds/shutter.mp3`), and full-screen preview.
- **Video Recording**: Hold the shutter button (500ms+) to record the AR canvas (`video/webm` via `MediaRecorder`) with a `REC` indicator and playback preview.
- **Gallery Media Input**: Upload local images or videos (`image/*`, `video/*`) and apply the active Camera Kit lens using `createImageSource` / `createVideoSource`.
- **COOP/COEP Dev Headers**: `vite.config.ts` configures `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` for the Vite dev server.

## Tech Stack

- **Framework**: React 19, TypeScript
- **Build Tool**: Vite (`rolldown-vite`) with React Compiler (`babel-plugin-react-compiler`)
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`)
- **AR SDK**: `@snap/camera-kit` (`^1.22.0`)
- **Linting**: ESLint

## Getting Started

### Prerequisites

- Node.js (with npm)
- A Snap Camera Kit **API Token**, **Lens Group ID**, and **Lens ID** from the Snap Camera Kit Portal

### Installation

```bash
npm install
```

### Configuration

Update `src/config/camerakit.ts` with your Snap Camera Kit credentials:

```ts
export const CAMERAKIT_CONFIG = {
  API_TOKEN: 'YOUR_API_TOKEN_HERE',
  GROUP_ID: 'YOUR_LENS_GROUP_ID',
  DEFAULT_LENS_ID: 'YOUR_DEFAULT_LENS_ID',
};
```

> **Note**: Avoid committing production API tokens to public repositories.

### Running Locally

```bash
npm run dev
```

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check (`tsc -b`) and build for production |
| `npm run lint` | Run ESLint across the project |
| `npm run preview` | Preview the production build locally |

## Project Structure

```text
├── public/
│   └── sounds/
│       └── shutter.mp3          # Shutter sound played on photo capture
├── src/
│   ├── components/
│   │   └── CameraKitWrapper.tsx # Camera Kit session, stream, lens, capture & UI
│   ├── config/
│   │   └── camerakit.ts         # API_TOKEN, GROUP_ID, DEFAULT_LENS_ID
│   ├── data/
│   │   └── lenses.json          # Sample lens metadata list
│   ├── App.tsx                  # Root component rendering CameraKitWrapper
│   ├── index.css                # Tailwind v4 import and custom keyframe animations
│   └── main.tsx                 # React entry point
├── index.html
├── package.json
├── react_lifecycle_summary.md   # Notes on React state & useEffect in CameraKitWrapper
└── vite.config.ts               # Vite, React Compiler, Tailwind, and COOP/COEP headers
```
