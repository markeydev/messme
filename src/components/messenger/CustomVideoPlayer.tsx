'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Play, Pause } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CustomVideoPlayerProps {
  src: string
  className?: string
  autoPlay?: boolean
  shouldPlay?: boolean
  loop?: boolean
  playsInline?: boolean
  muted?: boolean
  onEnded?: () => void
  fit?: 'cover' | 'contain'
  onDoubleTap?: () => void
}

export function CustomVideoPlayer({
  src,
  className,
  autoPlay = false,
  shouldPlay,
  loop = false,
  playsInline = true,
  muted = false,
  onEnded,
  fit = 'cover',
  onDoubleTap,
}: CustomVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(autoPlay || !!shouldPlay)
  const [showPlaybackState, setShowPlaybackState] = useState(false)
  const lastTapTimeRef = useRef(0)
  const hideStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.muted = muted

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)

    return () => {
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
    }
  }, [src, muted])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const wantPlay = shouldPlay ?? autoPlay
    if (wantPlay) {
      void video.play().catch(() => setIsPlaying(false))
      return
    }
    video.pause()
  }, [autoPlay, shouldPlay, src])

  useEffect(() => () => {
    if (hideStateTimerRef.current) clearTimeout(hideStateTimerRef.current)
  }, [])

  const revealPlaybackState = () => {
    setShowPlaybackState(true)
    if (hideStateTimerRef.current) clearTimeout(hideStateTimerRef.current)
    hideStateTimerRef.current = setTimeout(() => setShowPlaybackState(false), 520)
  }

  const togglePlayback = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play().catch(() => setIsPlaying(false))
    } else {
      video.pause()
    }
    revealPlaybackState()
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return
    const now = Date.now()
    if (now - lastTapTimeRef.current <= 280) {
      onDoubleTap?.()
    }
    lastTapTimeRef.current = now
  }

  return (
    <div
      className={cn('relative bg-black', className)}
      onClick={togglePlayback}
      onDoubleClick={() => onDoubleTap?.()}
      onPointerUp={handlePointerUp}
      role="button"
      tabIndex={0}
      aria-label="Переключить воспроизведение"
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          togglePlayback()
        }
      }}
    >
      <video
        ref={videoRef}
        key={src}
        src={src}
        className={cn('w-full h-full', fit === 'contain' ? 'object-contain' : 'object-cover')}
        autoPlay={autoPlay}
        loop={loop}
        playsInline={playsInline}
        muted={muted}
        onEnded={onEnded}
      />

      <span
        className={cn(
          'pointer-events-none absolute inset-0 m-auto h-14 w-14 rounded-full bg-black/40 text-white flex items-center justify-center transition-opacity duration-200',
          showPlaybackState ? 'opacity-100' : 'opacity-0'
        )}
      >
        {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
      </span>
    </div>
  )
}
