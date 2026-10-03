import * as THREE from 'three'

// Procedural canvas textures, so the 3D office ships without image or model files.
// Each texture is created once and cached.

const cache = new Map<string, THREE.Texture>()

function canvasTexture(key: string, width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.Texture {
  const cached = cache.get(key)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx) draw(ctx)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  cache.set(key, texture)
  return texture
}

/** Deterministic pseudo-random numbers so textures look the same on every load. */
function random(seed: number) {
  let value = seed
  return () => {
    value = (value * 16807) % 2147483647
    return (value - 1) / 2147483646
  }
}

export function screenTexture(active: boolean) {
  return canvasTexture(`screen-${active}`, 128, 80, (ctx) => {
    ctx.fillStyle = active ? '#15313a' : '#0d1112'; ctx.fillRect(0, 0, 128, 80)
    if (!active) return
    const rand = random(13)
    for (let line = 0; line < 9; line += 1) {
      ctx.fillStyle = ['#7ee0c3', '#f2c58a', '#a9d4ff', '#e7e7e7'][line % 4]
      ctx.fillRect(8 + (line % 3) * 6, 8 + line * 7.5, 30 + rand() * 70, 3)
    }
  })
}
