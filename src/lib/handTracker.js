import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const WASM_URL  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

let _landmarker = null
let _running    = false
let _prevPalms  = []   // per-hand previous palm position for velocity

export async function initHandTracker(videoEl, getDimensions, onResult) {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL)

  _landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: 'GPU'
    },
    runningMode: 'VIDEO',
    numHands: 2
  })

  _running = true
  detectLoop(videoEl, getDimensions, onResult)
}

function detectLoop(videoEl, getDimensions, onResult) {
  if (!_running) return
  const nowMs = performance.now()
  const results = _landmarker.detectForVideo(videoEl, nowMs)
  const { w, h } = getDimensions()
  onResult(processResults(results, w, h))
  requestAnimationFrame(() => detectLoop(videoEl, getDimensions, onResult))
}

function processResults(results, W, H) {
  if (!results.landmarks || results.landmarks.length === 0) {
    _prevPalms = []
    return []
  }

  return results.landmarks.map((handLandmarks, i) => {
    // Map normalised [0,1] coords to canvas pixels; mirror x for natural feel
    const pts = handLandmarks.map(lm => ({
      x: (1 - lm.x) * W,
      y: lm.y * H
    }))

    const palm = {
      x: (pts[0].x + pts[9].x) / 2,
      y: (pts[0].y + pts[9].y) / 2
    }

    const prev = _prevPalms[i] ?? palm
    const vx = palm.x - prev.x
    const vy = palm.y - prev.y
    _prevPalms[i] = palm

    return {
      palm,
      fingertips: [],
      velocity: { x: vx, y: vy },
      isMoving: Math.hypot(vx, vy) > 8
    }
  })
}

export function stopHandTracker() {
  _running = false
  _landmarker?.close?.()
  _landmarker = null
  _prevPalms  = []
}
