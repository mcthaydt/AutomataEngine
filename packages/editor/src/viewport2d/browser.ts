import type { DrawOp } from './projectDraw'

/** Paints the pure draw model onto a 2D canvas. Untested shim, keep trivially thin. */
export function paintMap(ctx: CanvasRenderingContext2D, ops: DrawOp[], size: { w: number; h: number }): void {
  ctx.clearRect(0, 0, size.w, size.h)
  ctx.strokeStyle = '#223'
  for (let x = 0; x <= size.w; x += 24) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, size.h)
    ctx.stroke()
  }
  for (let y = 0; y <= size.h; y += 24) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(size.w, y)
    ctx.stroke()
  }
  for (const op of ops) {
    // Gizmos (zones/points) paint translucent so they read as overlays, not geometry.
    ctx.globalAlpha = op.gizmo ? 0.4 : 1
    ctx.fillStyle = op.color
    ctx.strokeStyle = op.selected ? '#fff' : '#000'
    if (op.shape === 'rect') {
      ctx.fillRect(op.x, op.y, op.w!, op.h!)
      ctx.strokeRect(op.x, op.y, op.w!, op.h!)
    } else {
      ctx.beginPath()
      ctx.arc(op.x, op.y, op.r!, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
}
