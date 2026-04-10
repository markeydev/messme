'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Play, Pause, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VoiceMessageProps {
  audioUrl: string
  duration?: number | null
  isOwn: boolean
}

const BAR_COUNT = 30

function pseudoWaveform(seed: string, count: number): number[] {
  const bars: number[] = []
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0
  for (let i = 0; i < count; i++) {
    h = (Math.imul(1664525, h) + 1013904223) | 0
    bars.push(0.15 + (((h >>> 0) % 1000) / 1000) * 0.85)
  }
  return bars
}

function formatDur(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

export function VoiceMessage({ audioUrl, duration, isOwn }: VoiceMessageProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const waveRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState(duration ?? 0)
  const [dragging, setDragging] = useState(false)
  const [hoverProgress, setHoverProgress] = useState<number | null>(null)
  const animRef = useRef<number | null>(null)
  const bars = pseudoWaveform(audioUrl, BAR_COUNT)

  useEffect(() => {
    const audio = new Audio(audioUrl)
    audio.preload = 'metadata'
    audioRef.current = audio
    audio.onloadedmetadata = () => {
      if (isFinite(audio.duration)) setTotalDuration(Math.round(audio.duration))
    }
    audio.onended = () => {
      setPlaying(false)
      setCurrentTime(0)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
    return () => {
      audio.pause()
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl])

  const tick = () => {
    const audio = audioRef.current
    if (!audio) return
    setCurrentTime(audio.currentTime)
    animRef.current = requestAnimationFrame(tick)
  }

  const toggle = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    } else {
      setLoading(true)
      try {
        await audio.play()
        setPlaying(true)
        animRef.current = requestAnimationFrame(tick)
      } catch (e) {
        console.error('Audio play error:', e)
      } finally {
        setLoading(false)
      }
    }
  }

  const getProgressFromEvent = useCallback((e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent): number => {
    const el = waveRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX : e.clientX
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  const seekTo = useCallback((ratio: number) => {
    const audio = audioRef.current
    if (!audio || totalDuration <= 0) return
    const t = ratio * totalDuration
    audio.currentTime = t
    setCurrentTime(t)
  }, [totalDuration])

  // Pointer down — start drag
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    waveRef.current?.setPointerCapture(e.pointerId)
    setDragging(true)
    const p = getProgressFromEvent(e as any)
    seekTo(p)
    setHoverProgress(p)
  }

  // Pointer move — update while dragging or hovering
  const handlePointerMove = (e: React.PointerEvent) => {
    const p = getProgressFromEvent(e as any)
    setHoverProgress(p)
    if (dragging) seekTo(p)
  }

  // Pointer up
  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragging) {
      const p = getProgressFromEvent(e as any)
      seekTo(p)
      setDragging(false)
    }
  }

  const handlePointerLeave = () => {
    if (!dragging) setHoverProgress(null)
  }

  const progress = totalDuration > 0 ? currentTime / totalDuration : 0
  const displayProgress = dragging && hoverProgress !== null ? hoverProgress : progress
  const displayTime = dragging && hoverProgress !== null
    ? formatDur(Math.round(hoverProgress * totalDuration))
    : (playing || currentTime > 0 ? formatDur(Math.round(currentTime)) : formatDur(totalDuration))

  return (
    <div className="flex items-center gap-2.5 py-0.5 min-w-[200px] max-w-[260px]">
      {/* Play / Pause button */}
      <button
        onClick={toggle}
        className={cn(
          'h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center transition-colors',
          isOwn
            ? 'bg-[#5d6cf5]/30 hover:bg-[#5d6cf5]/40 text-white'
            : 'bg-black/[0.08] hover:bg-black/[0.12] dark:bg-white/[0.10] dark:hover:bg-white/[0.15] text-black dark:text-white'
        )}
      >
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : playing
            ? <Pause className="h-3.5 w-3.5" />
            : <Play className="h-3.5 w-3.5 ml-0.5" />}
      </button>

      {/* Waveform + time */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        {/* Waveform bars — clickable/draggable */}
        <div
          ref={waveRef}
          className="flex items-end gap-[2px] h-7 cursor-pointer select-none touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        >
          {bars.map((height, i) => {
            const barProgress = i / BAR_COUNT
            const filled = barProgress <= displayProgress
            const isHoverEdge = hoverProgress !== null && Math.abs(barProgress - hoverProgress) < 1 / BAR_COUNT
            return (
              <div
                key={i}
                className={cn(
                  'w-[3px] rounded-full flex-shrink-0 transition-colors duration-75',
                  isHoverEdge
                    ? isOwn ? 'bg-white' : 'bg-[#5d6cf5]'
                    : filled
                      ? isOwn ? 'bg-white/90' : 'bg-[#5d6cf5]'
                      : isOwn ? 'bg-white/25' : 'bg-black/20 dark:bg-white/25'
                )}
                style={{ height: `${Math.round(height * 100)}%` }}
              />
            )
          })}
        </div>
        {/* Duration */}
        <span className={cn('text-[10px] select-none tabular-nums',
          isOwn ? 'text-white/50' : 'text-black/40 dark:text-white/40')}>
          {displayTime}
        </span>
      </div>
    </div>
  )
}
