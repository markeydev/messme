'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Play, Pause } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VideoNoteProps {
  videoUrl: string
  duration?: number | null
  isOwn?: boolean
}

const SIZE = 200
const STROKE = 3
const R = SIZE / 2 - STROKE / 2 - 2
const CIRC = 2 * Math.PI * R

function formatDur(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function VideoNote({ videoUrl, duration, isOwn }: VideoNoteProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState(duration ?? 0)
  const animRef = useRef<number | null>(null)

  const tick = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    setCurrentTime(v.currentTime)
    if (!v.paused && !v.ended) {
      animRef.current = requestAnimationFrame(tick)
    } else if (v.ended) {
      setPlaying(false)
      setCurrentTime(0)
      v.currentTime = 0
    }
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onMeta = () => {
      if (v.duration && isFinite(v.duration)) setTotalDuration(v.duration)
    }
    v.addEventListener('loadedmetadata', onMeta)
    return () => {
      v.removeEventListener('loadedmetadata', onMeta)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play()
      setPlaying(true)
      animRef.current = requestAnimationFrame(tick)
    } else {
      v.pause()
      setPlaying(false)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }

  const progress = totalDuration > 0 ? Math.min(currentTime / totalDuration, 1) : 0
  const dashOffset = CIRC * (1 - progress)
  const displayTime = playing ? currentTime : (totalDuration > 0 ? totalDuration : (duration ?? 0))

  return (
    <div
      className="relative flex-shrink-0 cursor-pointer select-none"
      style={{ width: SIZE, height: SIZE }}
      onClick={togglePlay}
    >
      {/* Circular video */}
      <div className="absolute inset-0 rounded-full overflow-hidden bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-cover"
          playsInline
          preload="metadata"
        />
      </div>

      {/* Gradient overlay for controls visibility */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-b from-transparent via-transparent to-black/40 pointer-events-none" />

      {/* SVG progress ring */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={SIZE}
        height={SIZE}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Track */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={isOwn ? 'rgba(255,255,255,0.18)' : 'rgba(93,108,245,0.18)'}
          strokeWidth={STROKE}
        />
        {/* Progress */}
        {progress > 0 && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={isOwn ? 'rgba(255,255,255,0.9)' : '#5d6cf5'}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.1s linear' }}
          />
        )}
      </svg>

      {/* Play/Pause overlay */}
      <div className={cn(
        'absolute inset-0 rounded-full flex items-center justify-center transition-opacity duration-150',
        playing ? 'opacity-0 hover:opacity-100' : 'opacity-100'
      )}>
        <div className={cn(
          'w-12 h-12 rounded-full flex items-center justify-center shadow-lg',
          isOwn ? 'bg-white/25 backdrop-blur-sm' : 'bg-[#5d6cf5]/80 backdrop-blur-sm'
        )}>
          {playing
            ? <Pause className="h-5 w-5 text-white fill-white" />
            : <Play className={cn('h-5 w-5 fill-white ml-0.5', isOwn ? 'text-white' : 'text-white')} />
          }
        </div>
      </div>

      {/* Duration in bottom center */}
      <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
        <span className="text-[11px] text-white font-mono tabular-nums bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-full">
          {formatDur(displayTime)}
        </span>
      </div>
    </div>
  )
}
