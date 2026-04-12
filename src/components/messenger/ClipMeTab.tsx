'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { clipMeAPI, chatsAPI, type ClipMeComment, type ClipMePrivacy, type ClipMeVideo } from '@/lib/api'
import { useMessengerStore } from '@/lib/store'
import { messengerSocket } from '@/lib/socket'
import { Heart, MessageCircle, Repeat2, Plus, Send, Loader2, Lock, Users, Globe2, X, UserRound, Eye, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { CustomVideoPlayer } from '@/components/messenger/CustomVideoPlayer'

const PRIVACY_LABEL: Record<ClipMePrivacy, string> = {
  PUBLIC: 'Публично',
  FOLLOWERS: 'Подписчики',
  PRIVATE: 'Только я',
}

const PRIVACY_ICON: Record<ClipMePrivacy, ReactNode> = {
  PUBLIC: <Globe2 className="h-3.5 w-3.5" />,
  FOLLOWERS: <Users className="h-3.5 w-3.5" />,
  PRIVATE: <Lock className="h-3.5 w-3.5" />,
}

interface ClipMeTabProps {
  onClose?: () => void
  initialVideoId?: string | null
}

const formatReplyComment = (username: string, content: string) => `@${username} ${content}`

const formatRelativeTime = (value: string) => {
  const date = new Date(value)
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000)
  if (!Number.isFinite(diffSec) || diffSec < 0) return 'только что'
  if (diffSec < 60) return 'только что'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} мин назад`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} ч назад`
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)} дн назад`
  return date.toLocaleDateString('ru-RU')
}

export function ClipMeTab({ onClose, initialVideoId }: ClipMeTabProps) {
  const { user, chats } = useMessengerStore()
  const [videos, setVideos] = useState<ClipMeVideo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null)

  const [commentsOpenFor, setCommentsOpenFor] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, ClipMeComment[]>>({})
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [replyTargetByVideo, setReplyTargetByVideo] = useState<Record<string, ClipMeComment | null>>({})

  const [subscribedByAuthor, setSubscribedByAuthor] = useState<Record<string, boolean>>({})
  const [followersByAuthor, setFollowersByAuthor] = useState<Record<string, number>>({})

  const [shareVideo, setShareVideo] = useState<ClipMeVideo | null>(null)

  const [activeChannelUserId, setActiveChannelUserId] = useState<string | null>(null)
  const [channelLoading, setChannelLoading] = useState(false)
  const [channelData, setChannelData] = useState<{
    user?: { id: string; username: string; avatarUrl?: string | null }
    videos?: ClipMeVideo[]
    followersCount?: number
    followingCount?: number
    subscribedByMe?: boolean
  } | null>(null)
  const [channelPreviewVideo, setChannelPreviewVideo] = useState<ClipMeVideo | null>(null)

  const [uploadPickerOpen, setUploadPickerOpen] = useState(false)
  const [uploadSettingsOpen, setUploadSettingsOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null)
  const [uploadDescription, setUploadDescription] = useState('')
  const [uploadPrivacy, setUploadPrivacy] = useState<ClipMePrivacy>('PUBLIC')
  const [isUploading, setIsUploading] = useState(false)

  const uploadInputRef = useRef<HTMLInputElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const viewedVideoIdsRef = useRef<Set<string>>(new Set())
  const deepLinkResolvedRef = useRef(false)

  const messmeChats = useMemo(() => chats.filter(c => !c.gameMode), [chats])
  const channelTotalViews = useMemo(
    () => (channelData?.videos ?? []).reduce((sum, video) => sum + (video.viewsCount ?? 0), 0),
    [channelData?.videos]
  )

  const hydrateAuthorMeta = async (feedVideos: ClipMeVideo[]) => {
    try {
      const ids = Array.from(new Set(feedVideos.map(v => v.user.id))).filter(id => id !== user?.id)
      if (ids.length === 0) return
      const channels = await Promise.all(ids.map(id => clipMeAPI.getUserChannel(id)))
      setSubscribedByAuthor(prev => {
        const next = { ...prev }
        channels.forEach((result, idx) => {
          const id = ids[idx]
          if (id && typeof result.subscribedByMe === 'boolean') next[id] = result.subscribedByMe
        })
        return next
      })
      setFollowersByAuthor(prev => {
        const next = { ...prev }
        channels.forEach((result, idx) => {
          const id = ids[idx]
          if (id && typeof result.followersCount === 'number') next[id] = result.followersCount
        })
        return next
      })
    } catch (error) {
      console.error('ClipMe author metadata hydrate error:', error)
    }
  }

  const refreshFeed = async () => {
    setIsLoading(true)
    const result = await clipMeAPI.getFeed()
    let nextVideos = result.videos ?? []
    if (initialVideoId && !nextVideos.some(video => video.id === initialVideoId) && !deepLinkResolvedRef.current) {
      const deepLinked = await clipMeAPI.getVideoById(initialVideoId)
      if (deepLinked.video) nextVideos = [deepLinked.video, ...nextVideos]
      deepLinkResolvedRef.current = true
    }
    setVideos(nextVideos)
    setActiveVideoId(prev => prev ?? nextVideos[0]?.id ?? null)
    setIsLoading(false)
    void hydrateAuthorMeta(nextVideos)
  }

  useEffect(() => { void refreshFeed() }, [initialVideoId])

  useEffect(() => {
    if (!initialVideoId) return
    if (!videos.length) return
    const exists = videos.some(video => video.id === initialVideoId)
    if (!exists) return
    setActiveVideoId(initialVideoId)
    const node = videoRefs.current[initialVideoId]
    if (node) node.scrollIntoView({ block: 'start' })
  }, [initialVideoId, videos])

  useEffect(() => {
    if (!videos.length) return
    const observer = new IntersectionObserver(
      entries => {
        const visibleEntries = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const next = visibleEntries[0]
        const id = next?.target.getAttribute('data-video-id')
        if (!id) return
        setActiveVideoId(prev => {
          if (prev === id) return prev
          if (
            typeof window !== 'undefined'
            && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
            && typeof navigator !== 'undefined'
            && typeof navigator.vibrate === 'function'
          ) {
            // Very short pulse for subtle snap confirmation without prolonged vibration.
            navigator.vibrate(8)
          }
          return id
        })
      },
      { root: feedRef.current, threshold: 0.65 }
    )

    videos.forEach(video => {
      const node = videoRefs.current[video.id]
      if (node) observer.observe(node)
    })

    return () => observer.disconnect()
  }, [videos])

  useEffect(() => {
    if (!activeVideoId) return
    if (viewedVideoIdsRef.current.has(activeVideoId)) return
    viewedVideoIdsRef.current.add(activeVideoId)
    void clipMeAPI.registerView(activeVideoId).then(result => {
      if (typeof result.viewsCount !== 'number') return
      const viewsCount = result.viewsCount
      setVideos(prev => prev.map(video => video.id === activeVideoId ? { ...video, viewsCount } : video))
      setChannelData(prev => {
        if (!prev?.videos?.length) return prev
        return {
          ...prev,
          videos: prev.videos.map(video => video.id === activeVideoId ? { ...video, viewsCount } : video),
        }
      })
      setChannelPreviewVideo(prev => prev?.id === activeVideoId ? { ...prev, viewsCount } : prev)
    })
  }, [activeVideoId])

  const toggleLike = async (video: ClipMeVideo) => {
    const result = await clipMeAPI.toggleLike(video.id)
    if (result.liked === undefined || result.likesCount === undefined) return
    setVideos(prev => prev.map(v => v.id === video.id ? { ...v, likedByMe: result.liked!, likesCount: result.likesCount! } : v))
    setChannelData(prev => {
      if (!prev?.videos?.length) return prev
      return {
        ...prev,
        videos: prev.videos.map(v => v.id === video.id ? { ...v, likedByMe: result.liked!, likesCount: result.likesCount! } : v),
      }
    })
    setChannelPreviewVideo(prev => prev?.id === video.id ? { ...prev, likedByMe: result.liked!, likesCount: result.likesCount! } : prev)
  }

  const toggleRepost = async (video: ClipMeVideo) => {
    const result = await clipMeAPI.toggleRepost(video.id)
    if (result.reposted === undefined || result.repostsCount === undefined) return
    setVideos(prev => prev.map(v => v.id === video.id ? { ...v, repostedByMe: result.reposted!, repostsCount: result.repostsCount! } : v))
    setChannelData(prev => {
      if (!prev?.videos?.length) return prev
      return {
        ...prev,
        videos: prev.videos.map(v => v.id === video.id ? { ...v, repostedByMe: result.reposted!, repostsCount: result.repostsCount! } : v),
      }
    })
    setChannelPreviewVideo(prev => prev?.id === video.id ? { ...prev, repostedByMe: result.reposted!, repostsCount: result.repostsCount! } : prev)
  }

  const openComments = async (videoId: string) => {
    setCommentsOpenFor(videoId)
    if (comments[videoId]) return
    const result = await clipMeAPI.getComments(videoId)
    if (result.comments) setComments(prev => ({ ...prev, [videoId]: result.comments! }))
  }

  const addComment = async (videoId: string) => {
    const text = (commentDrafts[videoId] ?? '').trim()
    if (!text) return
    const replyTarget = replyTargetByVideo[videoId]
    const finalContent = replyTarget ? formatReplyComment(replyTarget.user.username, text) : text
    const result = await clipMeAPI.addComment(videoId, finalContent)
    if (!result.comment) return
    setComments(prev => ({ ...prev, [videoId]: [result.comment!, ...(prev[videoId] ?? [])] }))
    setCommentDrafts(prev => ({ ...prev, [videoId]: '' }))
    setReplyTargetByVideo(prev => ({ ...prev, [videoId]: null }))
    setVideos(prev => prev.map(v => v.id === videoId ? { ...v, commentsCount: result.commentsCount ?? v.commentsCount + 1 } : v))
    setChannelData(prev => {
      if (!prev?.videos?.length) return prev
      return {
        ...prev,
        videos: prev.videos.map(v => v.id === videoId ? { ...v, commentsCount: result.commentsCount ?? v.commentsCount + 1 } : v),
      }
    })
    setChannelPreviewVideo(prev => prev?.id === videoId ? { ...prev, commentsCount: result.commentsCount ?? prev.commentsCount + 1 } : prev)
  }

  const sendToMessme = async (targetChatId: string) => {
    if (!shareVideo) return
    const params = new URLSearchParams({ tab: 'clipme', clip: shareVideo.id })
    const clipUrl = new URL(`${window.location.pathname}?${params.toString()}`, window.location.origin).toString()
    const sent = await chatsAPI.sendMessage(targetChatId, `ClipMe: ${clipUrl}`)
    if (sent.message) messengerSocket.broadcastMessage(sent.message)
    setShareVideo(null)
  }

  const openChannel = async (targetUserId: string) => {
    setActiveChannelUserId(targetUserId)
    setChannelLoading(true)
    const channel = await clipMeAPI.getUserChannel(targetUserId)
    setChannelData(channel.error ? null : {
      user: channel.user,
      videos: channel.videos,
      followersCount: channel.followersCount,
      followingCount: channel.followingCount,
      subscribedByMe: channel.subscribedByMe,
    })
    setChannelLoading(false)
  }

  const applySubscribeResult = (authorId: string, subscribed: boolean, followersCount?: number) => {
    setSubscribedByAuthor(prev => ({ ...prev, [authorId]: subscribed }))
    if (typeof followersCount === 'number') {
      setFollowersByAuthor(prev => ({ ...prev, [authorId]: followersCount }))
      setChannelData(prev => prev?.user?.id === authorId ? { ...prev, followersCount } : prev)
    }
    setChannelData(prev => prev?.user?.id === authorId ? { ...prev, subscribedByMe: subscribed } : prev)
  }

  const handleUploadFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploadFile(file)
    setUploadDescription('')
    setUploadPrivacy('PUBLIC')
    setUploadPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setUploadPickerOpen(false)
    setUploadSettingsOpen(true)
  }

  const closeUploadSettings = () => {
    setUploadSettingsOpen(false)
    setUploadFile(null)
    setUploadDescription('')
    setUploadPrivacy('PUBLIC')
    setUploadPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  const publishVideo = async () => {
    if (!uploadFile) return
    setIsUploading(true)
    try {
      const uploaded = await clipMeAPI.uploadClipVideo(uploadFile)
      if (!uploaded.url) return
      const created = await clipMeAPI.createVideo(uploaded.url, uploadDescription, uploadPrivacy)
      if (!created.video) return
      setVideos(prev => [created.video!, ...prev])
      setActiveVideoId(created.video.id)
      closeUploadSettings()
      requestAnimationFrame(() => {
        const node = videoRefs.current[created.video!.id]
        if (node) node.scrollIntoView({ block: 'start' })
      })
    } finally {
      setIsUploading(false)
    }
  }

  useEffect(() => {
    return () => {
      if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl)
    }
  }, [uploadPreviewUrl])

  return (
    <div className="h-full min-h-0 md:fixed md:inset-0 md:z-40 md:flex md:items-center md:justify-center md:bg-black md:p-0">
      <div className="h-full min-h-0 flex flex-col bg-black text-white md:w-[min(560px,100vw)] md:h-full md:border-x md:border-white/10 overflow-hidden relative">
        <div className="absolute left-3 top-3 z-30 flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="h-9 w-9 rounded-full bg-black/55 hover:bg-black/70 flex items-center justify-center"
              title="Назад"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <div className="px-3 py-1.5 rounded-full bg-black/55 text-xs font-semibold">ClipMe</div>
        </div>

        <div ref={feedRef} className="flex-1 min-h-0 overflow-y-auto snap-y snap-mandatory scroll-smooth">
          {isLoading && <div className="h-full flex items-center justify-center text-sm text-white/70">Загрузка ленты...</div>}
          {!isLoading && videos.length === 0 && <div className="h-full flex items-center justify-center text-sm text-white/70">Пока нет видео.</div>}

          {videos.map(video => {
            const authorSubKey = video.user.id
            const isSubscribed = subscribedByAuthor[authorSubKey] ?? false
            const isActive = activeVideoId === video.id
            return (
              <section
                key={video.id}
                ref={node => { videoRefs.current[video.id] = node }}
                data-video-id={video.id}
                className="relative h-full min-h-full snap-start bg-black"
              >
                <CustomVideoPlayer src={video.videoUrl} className="h-full w-full object-cover" shouldPlay={isActive} loop />

                <div className="absolute inset-x-0 bottom-0 p-4 pt-16 bg-gradient-to-t from-black/80 via-black/45 to-transparent pointer-events-none">
                  <div className="flex items-end justify-between gap-3">
                    <div className="space-y-2 pointer-events-auto">
                      <button className="flex items-center gap-2" onClick={() => openChannel(video.user.id)}>
                        <Avatar className="h-9 w-9 border border-white/35">
                          {video.user.avatarUrl && <AvatarImage src={video.user.avatarUrl} />}
                          <AvatarFallback className="bg-[#5d6cf5] text-white text-[10px]">{video.user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-semibold flex items-center gap-1">{video.user.username} <UserRound className="h-3.5 w-3.5 opacity-70" /></p>
                          <p className="text-[11px] text-white/80 flex items-center gap-1">{PRIVACY_ICON[video.privacy]} {PRIVACY_LABEL[video.privacy]}</p>
                        </div>
                      </button>

                      {video.user.id !== user?.id && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 bg-white/20 hover:bg-white/30 text-white border-white/20"
                          onClick={async () => {
                            const result = await clipMeAPI.toggleSubscribe(video.user.id)
                            if (result.subscribed === undefined) return
                            applySubscribeResult(authorSubKey, result.subscribed, result.followersCount)
                          }}
                        >
                          {isSubscribed ? 'Вы подписаны' : 'Подписаться'}
                        </Button>
                      )}

                      {video.description && <p className="text-sm whitespace-pre-wrap max-w-[75vw]">{video.description}</p>}

                      <div className="flex items-center gap-3 text-[11px] text-white/80">
                        <span className="inline-flex items-center gap-1" aria-label={`Просмотры: ${video.viewsCount}`}><Eye className="h-3.5 w-3.5" /> {video.viewsCount}</span>
                        <span>Подписчики автора: {followersByAuthor[authorSubKey] ?? '—'}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-center gap-2 pointer-events-auto pb-2">
                      <button
                        onClick={() => toggleLike(video)}
                        className={cn('h-11 w-11 rounded-full text-sm flex items-center justify-center shadow-lg backdrop-blur', video.likedByMe ? 'bg-red-500/90 text-white' : 'bg-black/45 text-white')}
                        title="Лайк"
                      >
                        <Heart className={cn('h-4.5 w-4.5', video.likedByMe && 'fill-current')} />
                      </button>
                      <span className="text-[10px]">{video.likesCount}</span>

                      <button
                        onClick={() => openComments(video.id)}
                        className="h-11 w-11 rounded-full text-sm flex items-center justify-center bg-black/45 text-white shadow-lg backdrop-blur"
                        title="Комментарии"
                      >
                        <MessageCircle className="h-4.5 w-4.5" />
                      </button>
                      <span className="text-[10px]">{video.commentsCount}</span>

                      <button
                        onClick={() => toggleRepost(video)}
                        className={cn('h-11 w-11 rounded-full text-sm flex items-center justify-center shadow-lg backdrop-blur', video.repostedByMe ? 'bg-[#5d6cf5] text-white' : 'bg-black/45 text-white')}
                        title="Репост"
                      >
                        <Repeat2 className="h-4.5 w-4.5" />
                      </button>
                      <span className="text-[10px]">{video.repostsCount}</span>

                      <button
                        onClick={() => setShareVideo(video)}
                        className="h-11 w-11 rounded-full text-sm flex items-center justify-center bg-black/45 text-white shadow-lg backdrop-blur"
                        title="Поделиться"
                      >
                        <Send className="h-4.5 w-4.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )
          })}
        </div>

        <button
          onClick={() => setUploadPickerOpen(true)}
          className="absolute bottom-6 left-1/2 z-30 h-14 w-14 -translate-x-1/2 rounded-full bg-white text-black shadow-2xl flex items-center justify-center hover:scale-[1.03] transition-transform"
          title="Загрузить ролик"
        >
          <Plus className="h-7 w-7" />
        </button>
      </div>

      <Drawer open={!!commentsOpenFor} onOpenChange={open => !open && setCommentsOpenFor(null)}>
        <DrawerContent className="bg-white dark:bg-[#15151a] border-white/10">
          <DrawerHeader className="text-left pb-1">
            <DrawerTitle>Комментарии</DrawerTitle>
            <DrawerDescription>
              {commentsOpenFor ? `${(comments[commentsOpenFor] ?? []).length} комментариев` : ''}
            </DrawerDescription>
          </DrawerHeader>
          {commentsOpenFor && (
            <div className="px-4 pb-4">
              {replyTargetByVideo[commentsOpenFor] && (
                <div className="mb-3 flex items-center justify-between rounded-lg bg-[#5d6cf5]/10 text-xs px-2.5 py-1.5">
                  <span>Ответ для @{replyTargetByVideo[commentsOpenFor]?.user.username}</span>
                  <button onClick={() => setReplyTargetByVideo(prev => ({ ...prev, [commentsOpenFor]: null }))}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <div className="space-y-2 max-h-[46vh] overflow-y-auto pb-1">
                {(comments[commentsOpenFor] ?? []).map(comment => (
                  <div key={comment.id} className="rounded-xl bg-black/[0.04] dark:bg-white/[0.06] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-7 w-7">
                          {comment.user.avatarUrl && <AvatarImage src={comment.user.avatarUrl} />}
                          <AvatarFallback className="bg-[#5d6cf5] text-white text-[10px]">{comment.user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{comment.user.username}</p>
                          <p className="text-[11px] opacity-60">{formatRelativeTime(comment.createdAt)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <button disabled aria-disabled className="opacity-40 cursor-not-allowed">Лайк</button>
                        <button
                          onClick={() => setReplyTargetByVideo(prev => ({ ...prev, [commentsOpenFor]: comment }))}
                          className="text-[#5d6cf5] hover:underline"
                        >
                          Ответить
                        </button>
                      </div>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex gap-2">
                <Input
                  value={commentDrafts[commentsOpenFor] ?? ''}
                  onChange={e => setCommentDrafts(prev => ({ ...prev, [commentsOpenFor]: e.target.value }))}
                  placeholder={replyTargetByVideo[commentsOpenFor] ? 'Напишите ответ...' : 'Добавьте комментарий'}
                  className="h-10"
                />
                <Button size="sm" onClick={() => addComment(commentsOpenFor)} className="h-10 px-4">Отпр.</Button>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      <Dialog open={shareVideo !== null} onOpenChange={open => !open && setShareVideo(null)}>
        <DialogContent className="max-w-md bg-white dark:bg-[#15151a] border-black/[0.08] dark:border-white/[0.08]">
          <DialogTitle>Отправить в Messme</DialogTitle>
          <div className="max-h-[50vh] overflow-y-auto space-y-1">
            {messmeChats.length === 0 ? (
              <p className="text-sm opacity-60">Нет чатов Messme для отправки.</p>
            ) : (
              messmeChats.map(chat => (
                <button
                  key={chat.id}
                  onClick={() => sendToMessme(chat.id)}
                  className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-black/[0.05] dark:hover:bg-white/[0.08] text-left"
                >
                  <Avatar className="h-9 w-9">
                    {chat.avatarUrl && <AvatarImage src={chat.avatarUrl} />}
                    <AvatarFallback className="bg-[#5d6cf5] text-white text-xs font-semibold">{chat.title.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium truncate">{chat.title}</span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={activeChannelUserId !== null} onOpenChange={open => {
        if (!open) {
          setActiveChannelUserId(null)
          setChannelPreviewVideo(null)
        }
      }}>
        <DialogContent className="max-w-3xl bg-white dark:bg-[#15151a] border-black/[0.08] dark:border-white/[0.08]">
          <DialogTitle>Канал ClipMe</DialogTitle>
          {channelLoading ? (
            <div className="py-10 text-sm opacity-60 text-center">Загрузка канала...</div>
          ) : !channelData?.user ? (
            <div className="py-10 text-sm opacity-60 text-center">Канал недоступен</div>
          ) : (
            <div className="space-y-4 max-h-[74vh] overflow-y-auto pr-1">
              <div className="rounded-2xl bg-black/[0.05] dark:bg-white/[0.08] p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-14 w-14">
                      {channelData.user.avatarUrl && <AvatarImage src={channelData.user.avatarUrl} />}
                      <AvatarFallback className="bg-[#5d6cf5] text-white text-sm font-semibold">{channelData.user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{channelData.user.username}</p>
                      <p className="text-xs opacity-65">@{channelData.user.username}</p>
                      <p className="mt-1 text-xs opacity-75">ClipMe creator</p>
                    </div>
                  </div>
                  {channelData.user.id !== user?.id && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        const result = await clipMeAPI.toggleSubscribe(channelData.user!.id)
                        if (result.subscribed === undefined) return
                        applySubscribeResult(channelData.user!.id, result.subscribed, result.followersCount)
                      }}
                    >
                      {channelData.subscribedByMe ? 'Вы подписаны' : 'Подписаться'}
                    </Button>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-black/[0.05] dark:bg-white/[0.08] py-2">
                    <p className="font-semibold">{channelData.followersCount ?? 0}</p>
                    <p className="opacity-65">Подписчики</p>
                  </div>
                  <div className="rounded-lg bg-black/[0.05] dark:bg-white/[0.08] py-2">
                    <p className="font-semibold">{channelTotalViews}</p>
                    <p className="opacity-65">Просмотры</p>
                  </div>
                  <div className="rounded-lg bg-black/[0.05] dark:bg-white/[0.08] py-2">
                    <p className="font-semibold">{(channelData.videos ?? []).length}</p>
                    <p className="opacity-65">Ролики</p>
                  </div>
                </div>
              </div>

              {(channelData.videos ?? []).length === 0 ? (
                <p className="text-sm opacity-60 text-center py-8">В канале пока нет роликов</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(channelData.videos ?? []).map(video => (
                    <button
                      key={video.id}
                      className="relative aspect-[9/16] overflow-hidden rounded-xl bg-black group"
                      onClick={() => setChannelPreviewVideo(video)}
                    >
                      <video src={video.videoUrl} className="h-full w-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" muted playsInline preload="metadata" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-left">
                        <p className="text-[11px] text-white/90 line-clamp-2">{video.description || 'Без описания'}</p>
                        <p className="mt-1 text-[10px] text-white/80 inline-flex items-center gap-1" aria-label={`Просмотры: ${video.viewsCount}`}><Eye className="h-3 w-3" /> {video.viewsCount}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={channelPreviewVideo !== null} onOpenChange={open => !open && setChannelPreviewVideo(null)}>
        <DialogContent className="max-w-xl bg-black border-white/15 text-white p-0 overflow-hidden">
          {channelPreviewVideo && (
            <>
              <DialogTitle className="sr-only">Просмотр ролика</DialogTitle>
              <CustomVideoPlayer src={channelPreviewVideo.videoUrl} className="h-[70vh] w-full object-cover" shouldPlay loop />
              <div className="p-3 space-y-1 bg-black text-white">
                {channelPreviewVideo.description && <p className="text-sm whitespace-pre-wrap">{channelPreviewVideo.description}</p>}
                <p className="text-xs text-white/80">👁 {channelPreviewVideo.viewsCount} · ❤️ {channelPreviewVideo.likesCount} · 💬 {channelPreviewVideo.commentsCount}</p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={uploadPickerOpen} onOpenChange={setUploadPickerOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-[#15151a] border-black/[0.08] dark:border-white/[0.08]">
          <DialogTitle>Новый ролик</DialogTitle>
          <div className="space-y-3">
            <p className="text-sm opacity-70">Выберите видео из галереи или файловой системы.</p>
            <Button onClick={() => uploadInputRef.current?.click()} className="w-full bg-[#5d6cf5] hover:bg-[#4a5be0]">
              <Plus className="h-4 w-4 mr-1" /> Выбрать видео
            </Button>
            <input ref={uploadInputRef} type="file" accept="video/*" className="hidden" onChange={handleUploadFileChange} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={uploadSettingsOpen} onOpenChange={open => !open && closeUploadSettings()}>
        <DialogContent className="max-w-lg bg-white dark:bg-[#15151a] border-black/[0.08] dark:border-white/[0.08]">
          <DialogTitle>Настройки публикации</DialogTitle>
          <div className="space-y-3">
            {uploadPreviewUrl && (
              <div className="rounded-xl overflow-hidden bg-black">
                <video src={uploadPreviewUrl} controls className="w-full max-h-[45vh] object-contain" />
              </div>
            )}

            <Input
              value={uploadDescription}
              onChange={e => setUploadDescription(e.target.value)}
              placeholder="Описание (caption), хештеги"
              className="h-10"
            />

            <select
              value={uploadPrivacy}
              onChange={e => setUploadPrivacy(e.target.value as ClipMePrivacy)}
              className="h-10 w-full rounded-lg border border-black/[0.1] dark:border-white/[0.1] bg-transparent px-3 text-sm"
            >
              <option value="PUBLIC">Публично</option>
              <option value="FOLLOWERS">Только подписчики</option>
              <option value="PRIVATE">Только я</option>
            </select>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={closeUploadSettings} disabled={isUploading}>Отмена</Button>
              <Button className="flex-1 bg-[#5d6cf5] hover:bg-[#4a5be0]" onClick={publishVideo} disabled={!uploadFile || isUploading}>
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Опубликовать'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
