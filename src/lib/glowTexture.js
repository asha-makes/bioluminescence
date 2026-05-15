import { Texture } from 'pixi.js'

export function buildGlowTexture() {
  const size = 128
  const center = size / 2

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center)
  gradient.addColorStop(0,   'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.15, 'rgba(255, 255, 255, 0.92)')
  gradient.addColorStop(0.4,  'rgba(255, 255, 255, 0.45)')
  gradient.addColorStop(0.7,  'rgba(255, 255, 255, 0.12)')
  gradient.addColorStop(1,   'rgba(0, 0, 0, 0)')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  return Texture.from(canvas)
}
