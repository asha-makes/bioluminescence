import { Sprite } from 'pixi.js'

const POOL_SIZE = 2000
const LIFETIME_MIN = 2000
const LIFETIME_MAX = 3200
const HOLD_FRACTION = 0.25   // hang at full alpha this fraction of lifetime
const JITTER_BURST = 28
const JITTER_TRICKLE = 10
const JITTER_AMBIENT = 0
const AMBIENT_ALPHA_CAP = 0.30

const PRIMARY_COLORS   = [0x00ffcc, 0x00ccff, 0x00eebb]
const SECONDARY_COLORS = [0xaa00ff, 0x7700ff, 0x6600cc]
const AMBIENT_COLOR    = 0x003388

function rand(min, max) { return min + Math.random() * (max - min) }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

function makeParticle() {
  return {
    x: 0, y: 0,
    vx: 0, vy: 0,
    age: 0,
    lifetime: 1,
    alphaCap: 1,
    sprite: null,
    active: false
  }
}

export function createPool() {
  return Array.from({ length: POOL_SIZE }, makeParticle)
}

function acquireParticle(pool) {
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].active) return pool[i]
  }
  // Pool full — steal the oldest particle
  let oldest = pool[0]
  for (let i = 1; i < pool.length; i++) {
    if (pool[i].age > oldest.age) oldest = pool[i]
  }
  return oldest
}

function initParticle(p, container, texture, x, y, color, jitter, alphaCap) {
  p.x = x + rand(-jitter, jitter)
  p.y = y + rand(-jitter, jitter)
  const speed = rand(0.25, 0.85)
  const angle = rand(0, Math.PI * 2)
  p.vx = Math.cos(angle) * speed
  p.vy = Math.sin(angle) * speed - rand(0.05, 0.35) // slight upward bias
  p.age = 0
  p.lifetime = rand(LIFETIME_MIN, LIFETIME_MAX)
  p.alphaCap = alphaCap

  p.active = true

  if (!p.sprite) {
    const sprite = new Sprite(texture)
    sprite.anchor.set(0.5)
    sprite.blendMode = 'add'
    container.addChild(sprite)
    p.sprite = sprite
  }

  p.sprite.texture = texture
  p.sprite.tint = color
  p.sprite.alpha = alphaCap
  p.sprite.visible = true
  p.sprite.x = p.x
  p.sprite.y = p.y
}

function spawnOne(pool, container, texture, x, y, color, jitter, alphaCap = 1) {
  const p = acquireParticle(pool)
  initParticle(p, container, texture, x, y, color, jitter, alphaCap)
}

// 5–8 particles from palm + 4–7 from each fingertip, randomised brightness
export function spawnBurst(pool, container, texture, hand, isSecondHand = false) {
  const colors = isSecondHand ? SECONDARY_COLORS : PRIMARY_COLORS
  const palmCount = Math.floor(rand(5, 9))
  for (let i = 0; i < palmCount; i++) {
    spawnOne(pool, container, texture, hand.palm.x, hand.palm.y, pick(colors), JITTER_BURST, rand(0.55, 1.0))
  }
  for (const tip of hand.fingertips) {
    const tipCount = Math.floor(rand(4, 8))
    for (let i = 0; i < tipCount; i++) {
      spawnOne(pool, container, texture, tip.x, tip.y, pick(colors), JITTER_BURST, rand(0.55, 1.0))
    }
  }
}

// 2–4 particles from palm, randomised brightness to avoid saturation
export function spawnTrickle(pool, container, texture, hand, isSecondHand = false) {
  const colors = isSecondHand ? SECONDARY_COLORS : PRIMARY_COLORS
  const count = Math.floor(rand(2, 4))
  for (let i = 0; i < count; i++) {
    spawnOne(pool, container, texture, hand.palm.x, hand.palm.y, pick(colors), JITTER_TRICKLE, rand(0.4, 0.85))
  }
}

// 1–2 ambient particles at a random screen position, very faint
export function spawnAmbient(pool, container, texture, width, height) {
  const count = Math.random() < 0.4 ? 2 : 1
  for (let i = 0; i < count; i++) {
    const x = rand(width * 0.05, width * 0.95)
    const y = rand(height * 0.1, height * 0.95)
    spawnOne(pool, container, texture, x, y, AMBIENT_COLOR, JITTER_AMBIENT, AMBIENT_ALPHA_CAP)
  }
}

export function tickParticles(pool, elapsedMs) {
  for (const p of pool) {
    if (!p.active) continue

    p.age += elapsedMs

    if (p.age >= p.lifetime) {
      p.active = false
      if (p.sprite) p.sprite.visible = false
      continue
    }

    // Gentle upward float — accelerates slightly as particle ages
    p.vy -= 0.012

    p.x += p.vx
    p.y += p.vy

    // Ease-out alpha: hold at full for HOLD_FRACTION, then power-curve falloff
    const t = p.age / p.lifetime
    let alpha
    if (t < HOLD_FRACTION) {
      alpha = 1
    } else {
      const tNorm = (t - HOLD_FRACTION) / (1 - HOLD_FRACTION)
      alpha = Math.pow(1 - tNorm, 1.3)
    }
    alpha = Math.min(alpha, p.alphaCap)

    // Scale shrinks with alpha — kept small so particles stay individually visible
    const scale = alpha * 0.30 + 0.03

    const sprite = p.sprite
    sprite.x = p.x
    sprite.y = p.y
    sprite.alpha = alpha
    sprite.scale.set(scale)
    sprite.visible = alpha > 0.004
  }
}
