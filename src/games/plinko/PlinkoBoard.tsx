import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import {
  bucketFromPath,
  bucketPosition,
  colorForMultiplier,
  computeLayout,
  computeWaypoints,
  pegPosition,
  simulatePath,
  SEGMENT_DURATION,
  type Layout,
  type Point,
} from './engine'

export interface PlinkoBoardHandle {
  drop: () => Promise<{ bucket: number }>
}

interface PlinkoBoardProps {
  rows: number
  multipliers: number[]
}

interface BallAnim {
  waypoints: Point[]
  segmentIndex: number
  segmentStart: number
  x: number
  y: number
  jitterSeed: number
  bucket: number
  doneAt?: number
  resolve: (result: { bucket: number }) => void
}

interface Flash {
  col: number
  start: number
}

function easeInQuad(t: number) {
  return t * t
}

function easeInOutQuad(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export const PlinkoBoard = forwardRef<PlinkoBoardHandle, PlinkoBoardProps>(function PlinkoBoard(
  { rows, multipliers },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layoutRef = useRef<Layout>(computeLayout(rows))
  const ballsRef = useRef<BallAnim[]>([])
  const flashesRef = useRef<Flash[]>([])
  const multipliersRef = useRef(multipliers)
  const maxMultRef = useRef(Math.max(...multipliers))

  const layout = computeLayout(rows)

  useEffect(() => {
    layoutRef.current = computeLayout(rows)
    ballsRef.current = []
    flashesRef.current = []
  }, [rows])

  useEffect(() => {
    multipliersRef.current = multipliers
    maxMultRef.current = Math.max(...multipliers)
  }, [multipliers])

  useImperativeHandle(
    ref,
    () => ({
      drop: () =>
        new Promise((resolve) => {
          const currentLayout = layoutRef.current
          const path = simulatePath(currentLayout.rows)
          const bucket = bucketFromPath(path)
          const waypoints = computeWaypoints(currentLayout, path)
          ballsRef.current.push({
            waypoints,
            segmentIndex: 0,
            segmentStart: performance.now(),
            x: waypoints[0].x,
            y: waypoints[0].y,
            jitterSeed: Math.random() * Math.PI * 2,
            bucket,
            resolve,
          })
        }),
    }),
    [],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let raf: number

    function resize() {
      const l = layoutRef.current
      if (canvas!.width !== l.width * dpr || canvas!.height !== l.height * dpr) {
        canvas!.width = l.width * dpr
        canvas!.height = l.height * dpr
        canvas!.style.height = `${l.height}px`
      }
    }

    function step(time: number) {
      const l = layoutRef.current
      const totalSegments = l.rows + 1
      const remaining: BallAnim[] = []

      for (const ball of ballsRef.current) {
        if (ball.segmentIndex < totalSegments) {
          const p0 = ball.waypoints[ball.segmentIndex]
          const p1 = ball.waypoints[ball.segmentIndex + 1]
          const t = Math.min(1, (time - ball.segmentStart) / SEGMENT_DURATION)
          const wiggle = Math.sin(t * Math.PI * 3 + ball.jitterSeed) * (1 - t) * l.pegSpacing * 0.15
          ball.x = p0.x + (p1.x - p0.x) * easeInOutQuad(t) + wiggle
          ball.y = p0.y + (p1.y - p0.y) * easeInQuad(t)

          if (t >= 1) {
            ball.segmentIndex += 1
            ball.segmentStart = time
            if (ball.segmentIndex >= totalSegments) {
              ball.x = p1.x
              ball.y = p1.y
              flashesRef.current.push({ col: ball.bucket, start: time })
              ball.doneAt = time
              ball.resolve({ bucket: ball.bucket })
            }
          }
        }

        if (ball.doneAt === undefined || time - ball.doneAt < 400) {
          remaining.push(ball)
        }
      }

      ballsRef.current = remaining
      flashesRef.current = flashesRef.current.filter((f) => time - f.start < 450)
    }

    function draw(time: number) {
      const l = layoutRef.current
      ctx!.clearRect(0, 0, l.width, l.height)

      for (let row = 0; row < l.rows; row++) {
        for (let col = 0; col <= row; col++) {
          const { x, y } = pegPosition(l, row, col)
          ctx!.beginPath()
          ctx!.arc(x, y, l.pegRadius, 0, Math.PI * 2)
          ctx!.fillStyle = '#4a5778'
          ctx!.fill()
        }
      }

      const bucketY = l.topPadding + l.rows * l.rowSpacing
      const mults = multipliersRef.current
      const maxMult = maxMultRef.current
      const w = l.pegSpacing * 0.86

      for (let col = 0; col <= l.rows; col++) {
        const { x } = bucketPosition(l, col)
        const mult = mults[col]
        roundRect(ctx!, x - w / 2, bucketY + 8, w, l.bucketHeight, 6)
        ctx!.fillStyle = colorForMultiplier(mult, maxMult)
        ctx!.fill()

        const flash = flashesRef.current.find((f) => f.col === col)
        if (flash) {
          const alpha = 1 - (time - flash.start) / 450
          roundRect(ctx!, x - w / 2, bucketY + 8, w, l.bucketHeight, 6)
          ctx!.fillStyle = `rgba(255,255,255,${Math.max(0, alpha) * 0.55})`
          ctx!.fill()
        }

        ctx!.fillStyle = 'rgba(10,13,22,0.85)'
        ctx!.font = `700 ${Math.max(9, Math.min(12, l.pegSpacing * 0.24))}px Inter, sans-serif`
        ctx!.textAlign = 'center'
        ctx!.textBaseline = 'middle'
        ctx!.fillText(`${mult}x`, x, bucketY + 8 + l.bucketHeight / 2)
      }

      for (const ball of ballsRef.current) {
        const grad = ctx!.createRadialGradient(ball.x - 1.5, ball.y - 1.5, 0.5, ball.x, ball.y, l.ballRadius)
        grad.addColorStop(0, '#ffffff')
        grad.addColorStop(1, '#3cf281')
        ctx!.beginPath()
        ctx!.arc(ball.x, ball.y, l.ballRadius, 0, Math.PI * 2)
        ctx!.fillStyle = grad
        ctx!.shadowColor = 'rgba(60,242,129,0.6)'
        ctx!.shadowBlur = 8
        ctx!.fill()
        ctx!.shadowBlur = 0
      }
    }

    function frame(time: number) {
      resize()
      const dprNow = dpr
      ctx!.save()
      ctx!.scale(dprNow, dprNow)
      draw(time)
      ctx!.restore()
      step(time)
      raf = requestAnimationFrame(frame)
    }

    resize()
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={layout.width}
      height={layout.height}
      className="w-full"
      style={{ height: layout.height }}
    />
  )
})
