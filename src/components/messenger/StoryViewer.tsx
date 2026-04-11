'use client'

import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { storiesAPI, type Story } from '@/lib/api'
import { useMessengerStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Heart, Eye, X, ChevronLeft, ChevronRight } from 'lucide-react'

const IMAGE_STORY_DURATION_MS = 15_000

interface StoryViewerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string | null
  storyUserIds?: string[]
  onOpenChatWithUser?: (viewer: { id: string; username: string; avatarUrl?: string | null }) => void | Promise<void>
}

export function StoryViewer({ open, onOpenChange, userId, storyUserIds, onOpenChatWithUser }: StoryViewerProps) {
  const { user } = useMessengerStore()
  const [stories, setStories] = useState<Story[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [showViewers, setShowViewers] = useState(false)

  const goNext = useCallback(() => {
    setActiveIndex(prev => {
      if (prev >= stories.length - 1) {
        onOpenChange(false)
        return prev
      }
      return prev + 1
    })
  }, [stories.length, onOpenChange])

  const goPrev = useCallback(() => {
    setActiveIndex(prev => Math.max(0, prev - 1))
  }, [])

  useEffect(() => {
    if (!open || !userId) return
    let cancelled = false
    setIsLoading(true)
    const load = async () => {
      const uniqueUserIds = Array.from(new Set([userId, ...(storyUserIds ?? [])].filter(Boolean)))
      const loaded = await Promise.all(uniqueUserIds.map(async uid => {
        const result = await storiesAPI.getUserStories(uid)
        return result.stories ?? []
      }))
      if (cancelled) return
      const allStories = loaded.flat()
      setStories(allStories)
      const startIndex = allStories.findIndex(s => s.user.id === userId)
      setActiveIndex(startIndex >= 0 ? startIndex : 0)
      setShowViewers(false)
      setIsLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [open, userId, storyUserIds])

  const activeStory = stories[activeIndex]
  const isOwner = !!activeStory && activeStory.user.id === user?.id

  useEffect(() => {
    if (!open || !activeStory || isOwner) return
    if (activeStory.seenByMe) return
    const storyId = activeStory.id
    storiesAPI.markViewed(storyId).then(result => {
      setStories(prev => prev.map(s => s.id === storyId
        ? { ...s, seenByMe: true, viewsCount: result.viewsCount ?? s.viewsCount }
        : s))
    })
  }, [open, activeStory, isOwner])

  useEffect(() => {
    if (!open || !activeStory) return
    if (activeStory.mediaType !== 'IMAGE') return
    const id = setTimeout(() => goNext(), IMAGE_STORY_DURATION_MS)
    return () => clearTimeout(id)
  }, [open, activeStory, goNext])

  const handleToggleLike = async () => {
    if (!activeStory || isOwner) return
    const result = await storiesAPI.toggleLike(activeStory.id)
    if (result.error) return
    setStories(prev => prev.map(s => s.id === activeStory.id
      ? {
          ...s,
          likedByMe: !!result.liked,
          likesCount: result.likesCount ?? s.likesCount,
        }
      : s))
  }

  const handleViewerClick = async (viewer: { id: string; username: string; avatarUrl?: string | null }) => {
    if (!onOpenChatWithUser) return
    await onOpenChatWithUser(viewer)
    setShowViewers(false)
    onOpenChange(false)
  }

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-md w-[95vw] h-[90vh] p-0 overflow-hidden bg-black border-black text-white">
        <div className="relative h-full">
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 z-20 h-8 w-8 rounded-full bg-black/45 hover:bg-black/60 flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>

          {isLoading ? (
            <div className="h-full flex items-center justify-center text-white/70">Загрузка...</div>
          ) : stories.length === 0 ? (
            <div className="h-full flex items-center justify-center text-white/60">Сторис нет</div>
          ) : (
            <div className="h-full relative bg-black flex items-center justify-center">
              {activeStory.mediaType === 'IMAGE' ? (
                <img src={activeStory.mediaUrl} alt="Story" className="w-full h-full object-contain" />
              ) : (
                <video
                  key={activeStory.id}
                  src={activeStory.mediaUrl}
                  className="w-full h-full object-contain"
                  controls
                  autoPlay
                  playsInline
                  onEnded={goNext}
                />
              )}

              <div className="absolute left-3 right-14 top-3 z-20 flex items-center gap-2">
                {stories.map((story, idx) => (
                  <span
                    key={story.id}
                    className={cn(
                      'h-1 flex-1 rounded-full',
                      idx < activeIndex ? 'bg-white/90' : idx === activeIndex ? 'bg-white/70' : 'bg-white/25'
                    )}
                  />
                ))}
              </div>

              <div className="absolute left-3 top-8 right-14 z-10 flex items-center gap-2">
                <Avatar className="h-8 w-8 border border-white/50">
                  {activeStory.user.avatarUrl && <AvatarImage src={activeStory.user.avatarUrl} />}
                  <AvatarFallback className="bg-[#5d6cf5] text-white text-[10px] font-semibold">
                    {getInitials(activeStory.user.username)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-semibold drop-shadow">{activeStory.user.username}</span>
              </div>

              <button
                onClick={goPrev}
                disabled={activeIndex === 0}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-black/35 hover:bg-black/50 disabled:opacity-30 flex items-center justify-center"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={goNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-black/35 hover:bg-black/50 flex items-center justify-center"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <div className="absolute right-3 bottom-6 z-10 flex flex-col items-end gap-2">
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={handleToggleLike}
                  disabled={isOwner}
                  className={cn(
                    'h-11 w-11 rounded-full border-0',
                    activeStory.likedByMe ? 'bg-red-500 hover:bg-red-500' : 'bg-white/20 hover:bg-white/30'
                  )}
                >
                  <Heart className={cn('h-5 w-5', activeStory.likedByMe && 'fill-current')} />
                </Button>
                <span className="text-xs text-white/80 bg-black/40 rounded-full px-2 py-0.5">{activeStory.likesCount}</span>
              </div>

              {isOwner && (
                <div className="absolute left-3 bottom-5 right-16 z-10 bg-black/45 rounded-xl p-2.5 space-y-1">
                  <button
                    onClick={() => setShowViewers(true)}
                    className="w-full flex items-center gap-2 text-xs text-white/90 hover:text-white"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Просмотры: {activeStory.viewsCount}</span>
                  </button>
                  {!!activeStory.likes?.length && (
                    <p className="text-[11px] text-white/70 line-clamp-2">
                      Лайкнули: {activeStory.likes.map(v => v.username).join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {stories.length > 1 && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] bg-black/45 rounded-full px-2 py-1 z-20">
              {activeIndex + 1}/{stories.length}
            </div>
          )}

          {showViewers && activeStory && (
            <div className="absolute inset-0 z-30 bg-black/75 flex items-end sm:items-center sm:justify-center p-3" onClick={() => setShowViewers(false)}>
              <div className="w-full sm:max-w-sm max-h-[72vh] bg-[#121212] border border-white/10 rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 h-12 border-b border-white/10">
                  <span className="text-sm font-semibold">Просмотры ({activeStory.viewsCount})</span>
                  <button onClick={() => setShowViewers(false)} className="h-7 w-7 rounded-full hover:bg-white/10 flex items-center justify-center">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-[60vh] overflow-y-auto p-2">
                  {(activeStory.viewers ?? []).length === 0 ? (
                    <p className="text-sm text-white/55 px-2 py-6 text-center">Пока нет просмотров</p>
                  ) : (
                    (activeStory.viewers ?? []).map(v => (
                      <button
                        key={v.id}
                        onClick={() => handleViewerClick(v)}
                        className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/10 transition-colors text-left"
                      >
                        <Avatar className="h-9 w-9">
                          {v.avatarUrl && <AvatarImage src={v.avatarUrl} alt={v.username} />}
                          <AvatarFallback className="bg-[#5d6cf5] text-white text-xs font-semibold">{getInitials(v.username)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-white">{v.username}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
