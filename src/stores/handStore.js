import { writable } from 'svelte/store'

export const handStore = writable({
  source: 'none',
  hands: []
})

let prevX = null
let prevY = null
let lastMoveTime = 0

export function updateFromMouse(x, y) {
  const now = performance.now()
  let vx = 0
  let vy = 0

  if (prevX !== null) {
    vx = x - prevX
    vy = y - prevY
  }

  prevX = x
  prevY = y
  lastMoveTime = now

  handStore.set({
    source: 'mouse',
    hands: [{
      palm: { x, y },
      fingertips: [],
      velocity: { x: vx, y: vy },
      isMoving: Math.hypot(vx, vy) > 2
    }]
  })
}

// Call periodically; marks mouse as still when no movement for 100ms
export function clearMouseIfStale() {
  if (prevX === null) return
  if (performance.now() - lastMoveTime > 100) {
    handStore.update(state => {
      if (state.source !== 'mouse' || state.hands.length === 0) return state
      return {
        ...state,
        hands: state.hands.map(h => ({ ...h, isMoving: false, velocity: { x: 0, y: 0 } }))
      }
    })
  }
}
