import * as THREE from 'three'
import type { Task } from '../types.ts'

function texture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx) draw(ctx)
  const result = new THREE.CanvasTexture(canvas)
  result.colorSpace = THREE.SRGBColorSpace
  result.anisotropy = 8
  return result
}

export function parquetTexture() {
  const map = texture(512, 512, (ctx) => {
    ctx.fillStyle = '#d9ba8f'; ctx.fillRect(0, 0, 512, 512)
    const colors = ['#d7b58a', '#e4c9a3', '#ccaa7e', '#e8cda8', '#dab990']
    // Interlocking angled strips, with deterministic grain and fine seams.
    for (let column = -1; column < 9; column++) for (let row = -3; row < 20; row++) {
      const x = column * 64; const y = row * 32
      const slope = column % 2 === 0 ? 1 : -1
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 64, y + slope * 64); ctx.lineTo(x + 64, y + 32 + slope * 64); ctx.lineTo(x, y + 32); ctx.closePath()
      ctx.fillStyle = colors[((column * 7 + row * 13) % 5 + 5) % 5]; ctx.fill()
      ctx.strokeStyle = '#c3a279'; ctx.lineWidth = 1; ctx.stroke()
      for (let line = 5; line < 30; line += 6) {
        ctx.beginPath(); ctx.moveTo(x + 2, y + line); ctx.lineTo(x + 62, y + line + slope * 60)
        ctx.strokeStyle = 'rgba(130,85,37,.13)'; ctx.stroke()
      }
    }
  })
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  return map
}

export function officeSignTexture(text: string) {
  return texture(1024, 128, (ctx) => {
    ctx.fillStyle = '#f2ecdf'; ctx.fillRect(0, 0, 1024, 128)
    ctx.strokeStyle = '#b4b7a6'; ctx.lineWidth = 3; ctx.strokeRect(4, 4, 1016, 120)
    ctx.fillStyle = '#33483e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    let size = 60
    ctx.font = `600 ${size}px sans-serif`
    while (ctx.measureText(text).width > 980 && size > 18) { size -= 2; ctx.font = `600 ${size}px sans-serif` }
    ctx.fillText(text, 512, 66)
  })
}

export function skylineTexture() {
  return texture(1024, 512, (ctx) => {
    const sky = ctx.createLinearGradient(0, 0, 0, 512)
    sky.addColorStop(0, '#9bcce4'); sky.addColorStop(1, '#e8e6dc')
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 1024, 512)
    ctx.fillStyle = '#ffffffb0'
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(i * 140, 65 + (i % 3) * 23, 38, 8, 0, 0, Math.PI * 2); ctx.fill() }
    for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 24; i++) {
      const x = i * 49 + layer * 13; const height = 65 + ((i * 73 + layer * 91) % 170)
      const y = 512 - height + layer * 18
      ctx.fillStyle = ['#a7bdc9', '#8fa5b4', '#798e9e'][layer]; ctx.fillRect(x, y, 40, height)
      ctx.fillStyle = '#e4e8de80'
      for (let wx = x + 5; wx < x + 37; wx += 9) for (let wy = y + 8; wy < 512; wy += 14) ctx.fillRect(wx, wy, 3, 5)
    }
  })
}

export function kanbanColumn(status: string) {
  if (['done', 'archived', 'completed'].includes(status.toLowerCase())) return 3
  if (['review', 'reviewing', 'blocked', 'failed'].includes(status.toLowerCase())) return 2
  if (['running', 'working', 'in_progress'].includes(status.toLowerCase())) return 1
  return 0
}

export function kanbanTexture(tasks: Task[], available: boolean, partial: boolean) {
  return texture(1536, 800, (ctx) => {
    ctx.fillStyle = '#faf9f4'; ctx.fillRect(0, 0, 1536, 800)
    ctx.fillStyle = '#263e39'; ctx.font = 'bold 48px sans-serif'; ctx.fillText('PAPAN TUGAS', 44, 65)
    ctx.font = '22px sans-serif'; ctx.fillStyle = '#66756f'
    ctx.fillText(!available ? 'Data Kanban tidak tersedia' : partial ? 'KANBAN · sebagian board tidak tersedia' : 'KANBAN · tugas Hermes', 44, 102)
    const colors = ['#efd58b', '#95cbd9', '#eeb48d', '#aed0ad']
    const columns = ['ANTRIAN', 'DIKERJAKAN', 'REVIEW / BLOCKED', 'SELESAI']
    columns.forEach((title, col) => {
      const x = 40 + col * 376
      const items = tasks.filter((task) => kanbanColumn(task.status) === col)
      ctx.fillStyle = '#e8ebe4'; ctx.fillRect(x, 138, 356, 610)
      ctx.fillStyle = '#31443b'; ctx.font = 'bold 22px sans-serif'; ctx.fillText(`${title}  ${available ? items.length : '—'}`, x + 16, 174)
      if (!items.length) { ctx.font = '22px sans-serif'; ctx.fillStyle = '#69776e'; ctx.fillText(available ? 'Belum ada tugas' : 'Tidak tersedia', x + 16, 235) }
      items.slice(0, 4).forEach((task, row) => {
        const y = 199 + row * 127
        ctx.fillStyle = colors[col]; ctx.fillRect(x + 12, y, 332, 114)
        ctx.fillStyle = '#273e36'; ctx.font = 'bold 23px sans-serif'
        const words = task.title.split(/\s+/); let line = ''; let lineIndex = 0
        for (const word of words) {
          const candidate = `${line} ${word}`.trim()
          if (ctx.measureText(candidate).width > 300 && line) { ctx.fillText(line, x + 24, y + 29 + lineIndex * 26); lineIndex++; line = word; if (lineIndex === 2) break } else line = candidate
        }
        if (lineIndex < 2) ctx.fillText(line.slice(0, 29), x + 24, y + 29 + lineIndex * 26)
        ctx.font = '19px sans-serif'; ctx.fillStyle = '#3e554a'; ctx.fillText((task.assignee ?? 'Belum ditugaskan').slice(0, 30), x + 24, y + 96)
      })
      if (items.length > 4) { ctx.fillStyle = '#3e554a'; ctx.font = '21px sans-serif'; ctx.fillText(`+${items.length - 4} tugas lainnya`, x + 16, 733) }
    })
    ctx.font = '20px sans-serif'; ctx.fillStyle = '#66756f'; ctx.fillText('Klik papan untuk membuka Task Board', 44, 779)
  })
}
