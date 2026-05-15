# bioluminescence

An interactive particle canvas that reacts to your hands. Move in front of your webcam and watch glowing particles bloom from your palms — or use the mouse as a fallback.

Built with [Svelte](https://svelte.dev), [Pixi.js](https://pixijs.com), and [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker).

---

## What it looks like

- Deep black background (`#000005`)
- Teal/cyan particles (`#00ffcc`, `#00ccff`) for your first hand; purple/violet (`#aa00ff`, `#7700ff`) for a second
- Particles float upward, hold brightness briefly, then fade out on a power curve
- A faint blue ambient shimmer appears even when nothing is moving
- Edge vignette keeps focus on the centre

---

## Getting started

```bash
npm install
npm run dev
```

Open the URL printed by Vite. On the start screen, choose **enable camera** or **use mouse instead**.

> Camera mode requires HTTPS (or `localhost`) because browsers gate `getUserMedia` behind a secure context.

---

## Project structure

```
src/
  App.svelte            # root component: Pixi setup, input wiring, UI
  main.js               # Svelte mount point
  stores/
    handStore.js        # shared reactive state: hand positions + velocity
  lib/
    handTracker.js      # MediaPipe hand detection (camera path)
    particleSystem.js   # object pool, spawn logic, per-frame tick
    glowTexture.js      # procedural radial-gradient texture for sprites
```

---

## How MediaPipe works here

### Loading the model

`handTracker.js` uses two classes from `@mediapipe/tasks-vision`:

- **`FilesetResolver`** — downloads the MediaPipe WebAssembly runtime from jsDelivr CDN so it doesn't have to be bundled locally.
- **`HandLandmarker`** — a pre-trained model (Google's `hand_landmarker.task`, float16) that finds hands in images and returns the positions of 21 landmarks per hand (knuckles, fingertips, wrist, etc.).

```js
const vision = await FilesetResolver.forVisionTasks(WASM_URL)
_landmarker = await HandLandmarker.createFromOptions(vision, {
  baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
  runningMode: 'VIDEO',
  numHands: 2
})
```

- `delegate: 'GPU'` — runs inference on the GPU via WebGL, keeping the main thread free.
- `runningMode: 'VIDEO'` — tells the model it will receive a continuous stream of frames (as opposed to static images), so it can apply temporal smoothing between frames.
- `numHands: 2` — detects up to two hands simultaneously, giving you the teal/purple dual-hand effect.

### The detection loop

Every animation frame, `detectLoop` calls:

```js
const results = _landmarker.detectForVideo(videoEl, performance.now())
```

It passes the `<video>` element directly — MediaPipe reads the current frame from it. The timestamp is required in VIDEO mode so the model can track motion between frames.

### From landmarks to canvas coordinates

Each detected hand comes back as an array of 21 landmarks. Each landmark is a `{ x, y, z }` object where `x` and `y` are **normalised to [0, 1]** relative to the video frame dimensions.

`processResults` converts these to canvas pixels:

```js
const pts = handLandmarks.map(lm => ({
  x: (1 - lm.x) * W,   // mirrored so the canvas acts like a mirror
  y: lm.y * H
}))
```

The x-axis flip (`1 - lm.x`) makes the display behave like a mirror — if you raise your right hand, the glow appears on the right side of the screen, which is what feels natural.

### Palm centre

Rather than using a single landmark as the hand position, the code averages **landmark 0 (wrist)** and **landmark 9 (middle finger base knuckle)**:

```js
const palm = {
  x: (pts[0].x + pts[9].x) / 2,
  y: (pts[0].y + pts[9].y) / 2
}
```

This midpoint sits roughly in the centre of the palm and stays stable even when fingers flex.

### Velocity and movement state

Frame-to-frame palm positions are diffed to get a velocity vector. If the speed exceeds 8 px/frame the hand is marked as `isMoving`:

```js
const vx = palm.x - prev.x
const vy = palm.y - prev.y
isMoving: Math.hypot(vx, vy) > 8
```

The particle system uses this to switch between two spawn modes:
- **Moving** → `spawnBurst`: 5–8 particles from the palm in one go
- **Still** → `spawnTrickle`: 2–4 particles, tighter spread — the hand appears to gently glow even at rest

### Teardown

`stopHandTracker()` stops the RAF loop, calls `_landmarker.close()` to free GPU resources, and nulls the reference. The webcam stream is stopped separately in `App.svelte` by calling `.stop()` on each MediaStream track.

---

## Particle system

A fixed pool of 2 000 `Sprite` objects is allocated once at startup (`createPool`). Spawning a particle means grabbing an inactive slot from the pool (or stealing the oldest active one if the pool is full) and resetting its properties — no allocation happens at runtime.

Each frame `tickParticles` runs over the whole pool:

1. Increments `age`
2. Applies a small upward acceleration (`vy -= 0.012`) so particles float
3. Calculates alpha using an **ease-out curve**: hold at full brightness for the first 25% of lifetime, then power-curve fade (`(1 - t) ^ 1.3`) for the remaining 75%
4. Scales the sprite proportionally to alpha so particles shrink as they fade

Sprites use **additive blend mode** (`blendMode: 'add'`), which means overlapping particles brighten each other rather than occlude — this is what gives the effect its luminous quality.

---

## Tech stack

| Library | Role |
|---|---|
| Svelte 4 | UI components and reactive state |
| Pixi.js 8 | WebGL 2D renderer and sprite batching |
| MediaPipe Tasks Vision 0.10 | On-device hand landmark detection |
| Vite 5 | Dev server and bundler |
