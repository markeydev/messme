'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { storiesAPI, type Story } from '@/lib/api'
import { useMessengerStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Heart, Eye, X } from 'lucide-react'

interface StoryViewerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string | null
}

export function StoryViewer({ open, onOpenChange, userId }: StoryViewerProps) {
  const { user } = useMessengerStore()
  const [stories, setStories] = useState<Story[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !userId) return
    let cancelled = false
    setIsLoading(true)
    storiesAPI.getUserStories(userId).then(result => {
      if (cancelled) return
      setStories(result.stories ?? [])
      setActiveIndex(0)
      setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [open, userId])

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

  const onScroll = () => {
    const el = containerRef.current
    if (!el) return
    const idx = Math.round(el.scrollTop / el.clientHeight)
    if (idx !== activeIndex && idx >= 0 && idx < stories.length) setActiveIndex(idx)
  }

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[95vw] h-[90vh] p-0 overflow-hidden bg-black border-black text-white">
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
            <div
              ref={containerRef}
              onScroll={onScroll}
              className="h-full overflow-y-auto snap-y snap-mandatory"
            >
              {stories.map((story, idx) => (
                <section key={story.id} className="h-[90vh] snap-start relative bg-black flex items-center justify-center">
                  {story.mediaType === 'IMAGE' ? (
                    <img src={story.mediaUrl} alt="Story" className="w-full h-full object-contain" />
                  ) : (
                    <video
                      src={story.mediaUrl}
                      className="w-full h-full object-contain"
                      controls={idx === activeIndex}
                      autoPlay={idx === activeIndex}
                      playsInline
                    />
                  )}

                  <div className="absolute left-3 top-3 right-14 z-10 flex items-center gap-2">
                    <Avatar className="h-8 w-8 border border-white/50">
                      {story.user.avatarUrl && <AvatarImage src={story.user.avatarUrl} />}
                      <AvatarFallback className="bg-[#5d6cf5] text-white text-[10px] font-semibold">
                        {getInitials(story.user.username)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-semibold drop-shadow">{story.user.username}</span>
                  </div>

                  <div className="absolute right-3 bottom-6 z-10 flex flex-col items-end gap-2">
                    <Button
                      size="icon"
                      variant="secondary"
                      onClick={handleToggleLike}
                      disabled={isOwner || idx !== activeIndex}
                      className={cn(
                        'h-11 w-11 rounded-full border-0',
                        story.likedByMe ? 'bg-red-500 hover:bg-red-500' : 'bg-white/20 hover:bg-white/30'
                      )}
                    >
                      <Heart className={cn('h-5 w-5', story.likedByMe && 'fill-current')} />
                    </Button>
                    <span className="text-xs text-white/80 bg-black/40 rounded-full px-2 py-0.5">{story.likesCount}</span>
                  </div>

                  {isOwner && idx === activeIndex && (
                    <div className="absolute left-3 bottom-5 right-16 z-10 bg-black/45 rounded-xl p-2.5 space-y-1">
                      <div className="flex items-center gap-2 text-xs text-white/85">
                        <Eye className="h-3.5 w-3.5" />
                        <span>Просмотры: {story.viewsCount}</span>
                      </div>
                      {!!story.viewers?.length && (
                        <p className="text-[11px] text-white/70 line-clamp-2">
                          Кто посмотрел: {story.viewers.map(v => v.username).join(', ')}
                        </p>
                      )}
                      {!!story.likes?.length && (
                        <p className="text-[11px] text-white/70 line-clamp-2">
                          Лайкнули: {story.likes.map(v => v.username).join(', ')}
                        </p>
                      )}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}

          {stories.length > 1 && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] bg-black/45 rounded-full px-2 py-1 z-20">
              {activeIndex + 1}/{stories.length}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
