'use client'

import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Volume2, VolumeX } from 'lucide-react'
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
}

const MIN_DURATION_FALLBACK = 0.001

const formatTime = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  const total = Math.floor(value)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
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
}: CustomVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(autoPlay || !!shouldPlay)
  const [isMuted, setIsMuted] = useState(muted)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.muted = muted
    setIsMuted(muted)
    setCurrentTime(0)

    const handleLoadedMetadata = () => setDuration(video.duration || 0)
    const handleTimeUpdate = () => setCurrentTime(video.currentTime || 0)
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleVolumeChange = () => setIsMuted(video.muted)

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('volumechange', handleVolumeChange)

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('volumechange', handleVolumeChange)
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

  const togglePlayback = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play().catch(() => setIsPlaying(false))
    } else {
      video.pause()
    }
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setIsMuted(video.muted)
  }

  return (
    <div className={cn('relative bg-black group', className)}>
      <video
        ref={videoRef}
        key={src}
        src={src}
        className="w-full h-full object-inherit"
        autoPlay={autoPlay}
        loop={loop}
        playsInline={playsInline}
        muted={muted}
        onEnded={onEnded}
      />

      <button
        onClick={togglePlayback}
        className={cn(
          'absolute inset-0 m-auto h-14 w-14 rounded-full bg-black/45 text-white flex items-center justify-center transition-opacity',
          isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
        )}
      >
        {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
      </button>

      <div className="absolute left-0 right-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
        <input
          type="range"
          min={0}
          max={Math.max(duration, MIN_DURATION_FALLBACK)}
          step={0.1}
          value={Math.min(currentTime, duration)}
          onChange={e => {
            const video = videoRef.current
            if (!video) return
            const next = Number(e.target.value)
            video.currentTime = next
            setCurrentTime(next)
          }}
          className="w-full accent-[#5d6cf5]"
        />
        <div className="mt-1 flex items-center justify-between text-[10px] text-white/85">
          <button onClick={toggleMute} className="h-6 w-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center">
            {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
        </div>
      </div>
    </div>
  )
}
