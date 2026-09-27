import { useEffect, useRef, useState } from 'react'
import manifest from './manifest.json'

type Sets = typeof manifest.sets
export type SetName = keyof Sets
interface Anim {
  file: string
  frames: number
  fps: number
  loop: boolean
}

const SIZE = manifest.frameSize
const url = (file: string) => `${import.meta.env.BASE_URL}pet/${file}`

export function getAnim(set: SetName, name: string): Anim | undefined {
  return (manifest.sets[set] as Record<string, Anim>)[name]
}

// Грузим все полосы заранее, чтобы смена анимации не мигала.
export function preloadSprites() {
  for (const set of Object.values(manifest.sets))
    for (const a of Object.values(set as Record<string, Anim>)) new Image().src = url(a.file)
}

interface Props {
  set: SetName
  anim: string
  scale?: number
  onEnd?: () => void // для одноразовых анимаций
  className?: string
}

export function Sprite({ set, anim, scale = 2, onEnd, className }: Props) {
  const a = getAnim(set, anim)
  const [frame, setFrame] = useState(0)
  const endRef = useRef(onEnd)
  useEffect(() => {
    endRef.current = onEnd
  })

  // Смена анимации = новый key у компонента, поэтому кадр всегда начинается с нуля.
  useEffect(() => {
    if (!a || a.frames <= 1 || a.fps <= 0) return
    const start = performance.now()
    let raf = 0
    let ended = false
    const tick = (now: number) => {
      const f = Math.floor(((now - start) * a.fps) / 1000)
      if (a.loop) setFrame(f % a.frames)
      else if (f >= a.frames) {
        setFrame(a.frames - 1)
        if (!ended) {
          ended = true
          endRef.current?.()
        }
        return
      } else setFrame(f)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [a])

  if (!a) return null
  const px = SIZE * scale
  return (
    <div
      className={className}
      role="img"
      style={{
        width: px,
        height: px,
        backgroundImage: `url(${url(a.file)})`,
        backgroundSize: `${a.frames * px}px ${px}px`,
        backgroundPosition: `-${frame * px}px 0`,
        imageRendering: 'pixelated',
      }}
    />
  )
}
