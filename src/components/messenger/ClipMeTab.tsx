'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { clipMeAPI, chatsAPI, type ClipMeComment, type ClipMePrivacy, type ClipMeVideo } from '@/lib/api'
import { useMessengerStore } from '@/lib/store'
import { messengerSocket } from '@/lib/socket'
import { Heart, MessageCircle, Repeat2, Plus, Send, Loader2, X, Eye, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { CustomVideoPlayer } from '@/components/messenger/CustomVideoPlayer'

interface ClipMeTabProps {
  onClose?: () => void
  initialVideoId?: string | null
}

const VIDEO_LIKE_PULSE_DURATION_MS = 420
const COMMENT_LIKE_PULSE_DURATION_MS = 300
const VIEW_REGISTER_DELAY_MS = 1500

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

const formatRepliesLabel = (count: number) => {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return `Показать ${count} ответ`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `Показать ${count} ответа`
  return `Показать ${count} ответов`
}

interface ClipMeCommentNode extends ClipMeComment {
  children: ClipMeCommentNode[]
}

const buildCommentsTree = (items: ClipMeComment[]) => {
  const nodes = new Map<string, ClipMeCommentNode>()
  const roots: ClipMeCommentNode[] = []
  items.forEach(comment => nodes.set(comment.id, { ...comment, children: [] }))
  items.forEach(comment => {
    const node = nodes.get(comment.id)
    if (!node) return
    if (comment.parentId) {
      const parent = nodes.get(comment.parentId)
      if (parent) {
        parent.children.push(node)
        return
      }
    }
    roots.push(node)
  })
  return roots
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
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({})
  const [commentLikePulseId, setCommentLikePulseId] = useState<string | null>(null)

  const [subscribedByAuthor, setSubscribedByAuthor] = useState<Record<string, boolean>>({})
  const [followersByAuthor, setFollowersByAuthor] = useState<Record<string, number>>({})
  const [videoLikePulseId, setVideoLikePulseId] = useState<string | null>(null)

  const [shareVideo, setShareVideo] = useState<ClipMeVideo | null>(null)

  const [activeChannelUserId, setActiveChannelUserId] = useState<string | null>(null)
  const [channelLoading, setChannelLoading] = useState(false)
  const [channelData, setChannelData] = useState<{
    user?: { id: string; username: string; avatarUrl?: string | null; clipMeBio?: string | null }
    videos?: ClipMeVideo[]
    reposts?: ClipMeVideo[]
    followersCount?: number
    followingCount?: number
    subscribedByMe?: boolean
  } | null>(null)
  const [channelTab, setChannelTab] = useState<'videos' | 'reposts'>('videos')
  const [channelBioDraft, setChannelBioDraft] = useState('')
  const [isSavingChannelBio, setIsSavingChannelBio] = useState(false)
  const [channelError, setChannelError] = useState<string | null>(null)
  const [channelPreviewVideo, setChannelPreviewVideo] = useState<ClipMeVideo | null>(null)
  const [feedPausedForOverlay, setFeedPausedForOverlay] = useState(false)

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
  const pendingViewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeVideoStartedAtRef = useRef<number | null>(null)
  const previousActiveVideoIdRef = useRef<string | null>(null)
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
    if (pendingViewTimerRef.current) clearTimeout(pendingViewTimerRef.current)
    if (!activeVideoId || feedPausedForOverlay) {
      activeVideoStartedAtRef.current = null
      return
    }
    if (viewedVideoIdsRef.current.has(activeVideoId)) return
    activeVideoStartedAtRef.current = Date.now()
    const videoIdForRegister = activeVideoId
    pendingViewTimerRef.current = setTimeout(() => {
      if (!activeVideoStartedAtRef.current) return
      const watchedMs = Date.now() - activeVideoStartedAtRef.current
      viewedVideoIdsRef.current.add(videoIdForRegister)
      void clipMeAPI.registerView(videoIdForRegister, { watchedMs }).then(result => {
        if (typeof result.viewsCount !== 'number') return
        const viewsCount = result.viewsCount
        setVideos(prev => prev.map(video => video.id === videoIdForRegister ? { ...video, viewsCount } : video))
        setChannelData(prev => {
          if (!prev) return prev
          return {
            ...prev,
            videos: prev.videos?.map(video => video.id === videoIdForRegister ? { ...video, viewsCount } : video),
            reposts: prev.reposts?.map(video => video.id === videoIdForRegister ? { ...video, viewsCount } : video),
          }
        })
        setChannelPreviewVideo(prev => prev?.id === videoIdForRegister ? { ...prev, viewsCount } : prev)
      })
    }, VIEW_REGISTER_DELAY_MS)
    return () => {
      if (pendingViewTimerRef.current) clearTimeout(pendingViewTimerRef.current)
    }
  }, [activeVideoId, feedPausedForOverlay])

  const toggleLike = async (video: ClipMeVideo) => {
    const nextLiked = !video.likedByMe
    const optimisticLikes = Math.max(0, video.likesCount + (nextLiked ? 1 : -1))
    setVideoLikePulseId(video.id)
    setTimeout(() => setVideoLikePulseId(prev => (prev === video.id ? null : prev)), VIDEO_LIKE_PULSE_DURATION_MS)
    setVideos(prev => prev.map(v => v.id === video.id ? { ...v, likedByMe: nextLiked, likesCount: optimisticLikes } : v))
    setChannelData(prev => {
      if (!prev?.videos?.length) return prev
      return {
        ...prev,
        videos: prev.videos.map(v => v.id === video.id ? { ...v, likedByMe: nextLiked, likesCount: optimisticLikes } : v),
      }
    })
    setChannelPreviewVideo(prev => prev?.id === video.id ? { ...prev, likedByMe: nextLiked, likesCount: optimisticLikes } : prev)
    const result = await clipMeAPI.toggleLike(video.id)
    if (result.liked === undefined || result.likesCount === undefined) {
      setVideos(prev => prev.map(v => v.id === video.id ? video : v))
      return
    }
    setVideos(prev => prev.map(v => v.id === video.id ? { ...v, likedByMe: result.liked, likesCount: result.likesCount } : v))
    setChannelData(prev => {
      if (!prev?.videos?.length) return prev
      return {
        ...prev,
        videos: prev.videos.map(v => v.id === video.id ? { ...v, likedByMe: result.liked, likesCount: result.likesCount } : v),
      }
    })
    setChannelPreviewVideo(prev => prev?.id === video.id ? { ...prev, likedByMe: result.liked, likesCount: result.likesCount } : prev)
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
    setReplyTargetByVideo(prev => ({ ...prev, [videoId]: null }))
    if (comments[videoId]) return
    const result = await clipMeAPI.getComments(videoId)
    if (result.comments) setComments(prev => ({ ...prev, [videoId]: result.comments! }))
  }

  const addComment = async (videoId: string) => {
    const text = (commentDrafts[videoId] ?? '').trim()
    if (!text) return
    const replyTarget = replyTargetByVideo[videoId]
    const result = await clipMeAPI.addComment(videoId, text, replyTarget?.id ?? null)
    if (!result.comment) return
    setComments(prev => {
      const existing = prev[videoId] ?? []
      if (!replyTarget) return { ...prev, [videoId]: [result.comment!, ...existing] }
      const nestedIds = new Set<string>()
      const stack = [replyTarget.id]
      while (stack.length) {
        const current = stack.pop()!
        nestedIds.add(current)
        existing.forEach(item => {
          if (item.parentId === current) stack.push(item.id)
        })
      }
      const parentIndex = existing.findIndex(item => item.id === replyTarget.id)
      let insertAfter = parentIndex
      for (let i = existing.length - 1; i >= 0; i -= 1) {
        if (nestedIds.has(existing[i].id)) {
          insertAfter = i
          break
        }
      }
      const index = Math.max(parentIndex, insertAfter) + 1
      return {
        ...prev,
        [videoId]: [...existing.slice(0, index), result.comment!, ...existing.slice(index)],
      }
    })
    setCommentDrafts(prev => ({ ...prev, [videoId]: '' }))
    setReplyTargetByVideo(prev => ({ ...prev, [videoId]: null }))
    if (replyTarget) {
      setExpandedReplies(prev => ({ ...prev, [replyTarget.id]: true }))
    }
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

  const toggleCommentLike = async (videoId: string, commentId: string) => {
    const commentList = comments[videoId] ?? []
    const comment = commentList.find(item => item.id === commentId)
    if (!comment) return
    const optimisticLiked = !comment.likedByMe
    const optimisticCount = Math.max(0, comment.likesCount + (optimisticLiked ? 1 : -1))
    setCommentLikePulseId(commentId)
    setTimeout(() => setCommentLikePulseId(prev => (prev === commentId ? null : prev)), COMMENT_LIKE_PULSE_DURATION_MS)
    setComments(prev => ({
      ...prev,
      [videoId]: (prev[videoId] ?? []).map(item => item.id === commentId
        ? { ...item, likedByMe: optimisticLiked, likesCount: optimisticCount }
        : item),
    }))
    const result = await clipMeAPI.toggleCommentLike(commentId)
    if (result.liked === undefined || result.likesCount === undefined) {
      setComments(prev => ({
        ...prev,
        [videoId]: (prev[videoId] ?? []).map(item => item.id === commentId ? comment : item),
      }))
      return
    }
    setComments(prev => ({
      ...prev,
      [videoId]: (prev[videoId] ?? []).map(item => item.id === commentId
        ? { ...item, likedByMe: result.liked, likesCount: result.likesCount }
        : item),
    }))
  }

  const sendToMessme = async (targetChatId: string) => {
    if (!shareVideo) return
    const clipUrl = new URL('/', window.location.origin)
    clipUrl.searchParams.set('tab', 'clipme')
    clipUrl.searchParams.set('clip', shareVideo.id)
    const sent = await chatsAPI.sendMessage(targetChatId, `ClipMe: ${clipUrl}`)
    if (sent.message) messengerSocket.broadcastMessage(sent.message)
    setShareVideo(null)
  }

  const openChannel = async (targetUserId: string) => {
    const currentActive = activeVideoId
    previousActiveVideoIdRef.current = currentActive
    setFeedPausedForOverlay(true)
    setActiveVideoId(null)
    setActiveChannelUserId(targetUserId)
    setChannelLoading(true)
    setChannelError(null)
    setChannelTab('videos')
    const channel = await clipMeAPI.getUserChannel(targetUserId)
    setChannelData(channel.error ? null : {
      user: channel.user,
      videos: channel.videos,
      reposts: channel.reposts,
      followersCount: channel.followersCount,
      followingCount: channel.followingCount,
      subscribedByMe: channel.subscribedByMe,
    })
    setChannelBioDraft(channel.user?.clipMeBio ?? '')
    if (channel.error) setChannelError(channel.error)
    setChannelLoading(false)
  }

  const closeChannel = () => {
    setActiveChannelUserId(null)
    setChannelPreviewVideo(null)
    setFeedPausedForOverlay(false)
    const previousActive = previousActiveVideoIdRef.current
    if (previousActive) {
      setActiveVideoId(previousActive)
      const node = videoRefs.current[previousActive]
      if (node) node.scrollIntoView({ block: 'start' })
    }
  }

  const applySubscribeResult = (authorId: string, subscribed: boolean, followersCount?: number) => {
    setSubscribedByAuthor(prev => ({ ...prev, [authorId]: subscribed }))
    if (typeof followersCount === 'number') {
      setFollowersByAuthor(prev => ({ ...prev, [authorId]: followersCount }))
      setChannelData(prev => prev?.user?.id === authorId ? { ...prev, followersCount } : prev)
    }
    setChannelData(prev => prev?.user?.id === authorId ? { ...prev, subscribedByMe: subscribed } : prev)
  }

  const saveChannelBio = async () => {
    if (!channelData?.user?.id || channelData.user.id !== user?.id) return
    setIsSavingChannelBio(true)
    setChannelError(null)
    const result = await clipMeAPI.updateChannelBio(channelData.user.id, channelBioDraft)
    if (result.error || !result.user) {
      setChannelError(result.error ?? 'Ошибка обновления описания канала')
      setIsSavingChannelBio(false)
      return
    }
    setChannelData(prev => {
      if (!prev?.user) return prev
      return { ...prev, user: { ...prev.user, clipMeBio: result.user?.clipMeBio ?? null } }
    })
    setChannelBioDraft(result.user.clipMeBio ?? '')
    setIsSavingChannelBio(false)
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

  const activeCommentTree = useMemo(
    () => (commentsOpenFor ? buildCommentsTree(comments[commentsOpenFor] ?? []) : []),
    [commentsOpenFor, comments]
  )

  const renderCommentNode = (videoId: string, node: ClipMeCommentNode, depth = 0): ReactNode => {
    const canRenderChildren = depth < 7
    const isExpanded = expandedReplies[node.id]
    return (
      <div key={node.id} className={cn(depth > 0 && 'pl-3 border-l border-black/10 dark:border-white/10')}>
        <div className="rounded-xl bg-black/[0.04] dark:bg-white/[0.06] px-3 py-2.5">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="h-7 w-7">
                {node.user.avatarUrl && <AvatarImage src={node.user.avatarUrl} />}
                <AvatarFallback className="bg-[#5d6cf5] text-white text-[10px]">{node.user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{node.user.username}</p>
                <p className="text-[11px] opacity-60">{formatRelativeTime(node.createdAt)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <button
                onClick={() => toggleCommentLike(videoId, node.id)}
                className={cn(
                  'group inline-flex flex-col items-center justify-center rounded-full p-1.5 transition-transform',
                  node.likedByMe ? 'text-red-500' : 'text-black/65 dark:text-white/75',
                  commentLikePulseId === node.id && 'scale-110'
                )}
              >
                <Heart className={cn('h-4 w-4', node.likedByMe && 'fill-current')} />
                <span className="text-[10px] leading-none mt-0.5">{node.likesCount}</span>
              </button>
              <button
                onClick={() => setReplyTargetByVideo(prev => ({ ...prev, [videoId]: node }))}
                className="text-[#5d6cf5] hover:underline"
              >
                Ответить
              </button>
            </div>
          </div>
          <p className="text-sm whitespace-pre-wrap">{node.content}</p>
        </div>
        {node.children.length > 0 && canRenderChildren && (
          <div className="mt-2 space-y-2">
            {!isExpanded ? (
              <button
                onClick={() => setExpandedReplies(prev => ({ ...prev, [node.id]: true }))}
                className="text-xs text-[#5d6cf5] hover:underline"
              >
                {formatRepliesLabel(node.children.length)}
              </button>
            ) : (
              <>
                {node.children.map(child => renderCommentNode(videoId, child, depth + 1))}
                {node.children.length > 2 && (
                  <button
                    onClick={() => setExpandedReplies(prev => ({ ...prev, [node.id]: false }))}
                    className="text-xs text-black/60 dark:text-white/70 hover:underline"
                  >
                    Скрыть ответы
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    )
  }

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

        <div ref={feedRef} className="flex-1 min-h-0 overflow-y-auto no-scrollbar snap-y snap-mandatory scroll-smooth">
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
                className="relative h-dvh min-h-dvh snap-start bg-black"
              >
                <CustomVideoPlayer
                  src={video.videoUrl}
                  className="h-full w-full"
                  shouldPlay={isActive}
                  loop
                  fit="contain"
                  onDoubleTap={() => {
                    if (!video.likedByMe) void toggleLike(video)
                  }}
                />

                <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 pb-5 bg-gradient-to-t from-black/60 via-black/30 to-transparent">
                  <div className="pointer-events-auto max-w-[calc(100%-72px)] space-y-2 rounded-2xl bg-black/20 px-3 py-2 backdrop-blur-sm">
                    <button className="flex items-center gap-2" onClick={() => openChannel(video.user.id)}>
                      <Avatar className="h-9 w-9 border border-white/35">
                        {video.user.avatarUrl && <AvatarImage src={video.user.avatarUrl} />}
                        <AvatarFallback className="bg-[#5d6cf5] text-white text-[10px]">{video.user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">@{video.user.username}</p>
                        {video.user.id !== user?.id && (
                          <span className="inline-flex items-center rounded-full bg-black/35 px-2 py-0.5 text-[11px]">
                            {isSubscribed ? 'Вы подписаны' : '+'}
                          </span>
                        )}
                      </div>
                    </button>

                    {video.user.id !== user?.id && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 bg-white/15 hover:bg-white/25 text-white border-white/15 px-2.5"
                        onClick={async () => {
                          const result = await clipMeAPI.toggleSubscribe(video.user.id)
                          if (result.subscribed === undefined) return
                          applySubscribeResult(authorSubKey, result.subscribed, result.followersCount)
                        }}
                      >
                        {isSubscribed ? 'Вы подписаны' : '+'}
                      </Button>
                    )}

                    {video.description && <p className="text-sm whitespace-pre-wrap">{video.description}</p>}

                    <div className="flex items-center gap-3 text-[11px] text-white/80">
                      <span className="inline-flex items-center gap-1" aria-label={`Просмотры: ${video.viewsCount}`}><Eye className="h-3.5 w-3.5" /> {video.viewsCount}</span>
                    </div>
                  </div>
                </div>

                <div className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex flex-col items-center gap-2 pointer-events-auto">
                  <button
                    onClick={() => toggleLike(video)}
                    className={cn(
                      'h-12 w-12 rounded-full text-sm flex items-center justify-center shadow-lg backdrop-blur transition-transform',
                      video.likedByMe ? 'bg-red-500/85 text-white' : 'bg-black/35 text-white',
                      videoLikePulseId === video.id && 'scale-110'
                    )}
                    title="Лайк"
                  >
                    <Heart className={cn('h-5 w-5', video.likedByMe && 'fill-current')} />
                  </button>
                  <span className="text-[10px] text-white/90">{video.likesCount}</span>

                  <button
                    onClick={() => openComments(video.id)}
                    className="h-12 w-12 rounded-full text-sm flex items-center justify-center bg-black/35 text-white shadow-lg backdrop-blur"
                    title="Комментарии"
                  >
                    <MessageCircle className="h-5 w-5" />
                  </button>
                  <span className="text-[10px] text-white/90">{video.commentsCount}</span>

                  <button
                    onClick={() => toggleRepost(video)}
                    className={cn('h-12 w-12 rounded-full text-sm flex items-center justify-center shadow-lg backdrop-blur', video.repostedByMe ? 'bg-[#5d6cf5] text-white' : 'bg-black/35 text-white')}
                    title="Репост"
                  >
                    <Repeat2 className="h-5 w-5" />
                  </button>
                  <span className="text-[10px] text-white/90">{video.repostsCount}</span>

                  <button
                    onClick={() => setShareVideo(video)}
                    className="h-12 w-12 rounded-full text-sm flex items-center justify-center bg-black/35 text-white shadow-lg backdrop-blur"
                    title="Поделиться"
                  >
                    <Send className="h-5 w-5" />
                  </button>
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
        <DrawerContent className="bg-white dark:bg-[#15151a] border-white/10 h-[80dvh] max-h-[80dvh] flex flex-col">
          <DrawerHeader className="text-left pb-1 shrink-0">
            <DrawerTitle>Комментарии</DrawerTitle>
            <DrawerDescription>
              {commentsOpenFor ? `${(comments[commentsOpenFor] ?? []).length} комментариев` : ''}
            </DrawerDescription>
          </DrawerHeader>
          {commentsOpenFor && (
            <div className="px-4 pb-4 flex-1 min-h-0 flex flex-col">
              {replyTargetByVideo[commentsOpenFor] && (
                <div className="mb-3 flex items-center justify-between rounded-lg bg-[#5d6cf5]/10 text-xs px-2.5 py-1.5">
                  <span>Ответ для @{replyTargetByVideo[commentsOpenFor]?.user.username}</span>
                  <button onClick={() => setReplyTargetByVideo(prev => ({ ...prev, [commentsOpenFor]: null }))}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <div className="space-y-2 flex-1 min-h-0 overflow-y-auto no-scrollbar pb-2">
                {activeCommentTree.map(comment => renderCommentNode(commentsOpenFor, comment))}
              </div>

              <div className="mt-3 flex gap-2 shrink-0">
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

      {activeChannelUserId !== null && (
        <div className="fixed inset-0 z-40 bg-black text-white">
          <div className="h-full max-w-4xl mx-auto flex flex-col">
            <div className="h-14 px-4 flex items-center justify-between border-b border-white/10 bg-black/80 backdrop-blur">
              <button onClick={closeChannel} className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <p className="text-sm font-semibold">Канал ClipMe</p>
              <span className="w-9" />
            </div>

            {channelLoading ? (
              <div className="flex-1 flex items-center justify-center text-sm text-white/60">Загрузка канала...</div>
            ) : !channelData?.user ? (
              <div className="flex-1 flex items-center justify-center text-sm text-white/60">Канал недоступен</div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-4 space-y-4">
                <div className="rounded-2xl bg-white/10 p-3.5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-14 w-14">
                        {channelData.user.avatarUrl && <AvatarImage src={channelData.user.avatarUrl} />}
                        <AvatarFallback className="bg-[#5d6cf5] text-white text-sm font-semibold">{channelData.user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">@{channelData.user.username}</p>
                        <p className="text-xs text-white/70">ClipMe creator</p>
                      </div>
                    </div>
                    {channelData.user.id !== user?.id && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="bg-white/15 hover:bg-white/25 text-white"
                        onClick={async () => {
                          const result = await clipMeAPI.toggleSubscribe(channelData.user!.id)
                          if (result.subscribed === undefined) return
                          applySubscribeResult(channelData.user!.id, result.subscribed, result.followersCount)
                        }}
                      >
                        {channelData.subscribedByMe ? 'Вы подписаны' : '+'}
                      </Button>
                    )}
                  </div>

                  {channelData.user.id === user?.id ? (
                    <div className="space-y-2">
                      <Input
                        value={channelBioDraft}
                        onChange={e => setChannelBioDraft(e.target.value)}
                        placeholder="Описание канала"
                        className="bg-white/10 border-white/15 text-white placeholder:text-white/50"
                        maxLength={240}
                      />
                      <Button size="sm" onClick={saveChannelBio} disabled={isSavingChannelBio} className="bg-[#5d6cf5] hover:bg-[#4a5be0]">
                        {isSavingChannelBio ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Сохранить описание'}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-white/85 whitespace-pre-wrap">{channelData.user.clipMeBio || 'Описание не добавлено'}</p>
                  )}

                  <div className="mt-1 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-white/10 py-2">
                      <p className="font-semibold">{channelData.followersCount ?? 0}</p>
                      <p className="text-white/70">Подписчики</p>
                    </div>
                    <div className="rounded-lg bg-white/10 py-2">
                      <p className="font-semibold">{channelTotalViews}</p>
                      <p className="text-white/70">Просмотры</p>
                    </div>
                    <div className="rounded-lg bg-white/10 py-2">
                      <p className="font-semibold">{(channelData.videos ?? []).length}</p>
                      <p className="text-white/70">Ролики</p>
                    </div>
                  </div>
                  {channelError && <p className="text-xs text-red-300">{channelError}</p>}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setChannelTab('videos')}
                    className={cn('h-8 px-3 rounded-full text-xs', channelTab === 'videos' ? 'bg-white text-black' : 'bg-white/10 text-white')}
                  >
                    Видео
                  </button>
                  <button
                    onClick={() => setChannelTab('reposts')}
                    className={cn('h-8 px-3 rounded-full text-xs', channelTab === 'reposts' ? 'bg-white text-black' : 'bg-white/10 text-white')}
                  >
                    Репосты
                  </button>
                </div>

                {(channelTab === 'videos' ? (channelData.videos ?? []) : (channelData.reposts ?? [])).length === 0 ? (
                  <p className="text-sm text-white/60 text-center py-8">
                    {channelTab === 'videos' ? 'В канале пока нет роликов' : 'Репостов пока нет'}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(channelTab === 'videos' ? (channelData.videos ?? []) : (channelData.reposts ?? [])).map(video => (
                      <button
                        key={`${channelTab}-${video.id}`}
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
          </div>
        </div>
      )}

      <Dialog open={channelPreviewVideo !== null} onOpenChange={open => !open && setChannelPreviewVideo(null)}>
        <DialogContent className="max-w-xl bg-black border-white/15 text-white p-0 overflow-hidden">
          {channelPreviewVideo && (
            <>
              <DialogTitle className="sr-only">Просмотр ролика</DialogTitle>
              <CustomVideoPlayer src={channelPreviewVideo.videoUrl} className="h-[70vh] w-full" shouldPlay loop fit="contain" />
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
