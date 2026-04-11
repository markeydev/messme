'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { clipMeAPI, chatsAPI, type ClipMeComment, type ClipMePrivacy, type ClipMeVideo } from '@/lib/api'
import { useMessengerStore } from '@/lib/store'
import { messengerSocket } from '@/lib/socket'
import { Heart, MessageCircle, Repeat2, Plus, Send, Loader2, Lock, Users, Globe2, X, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
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
}

const formatReplyComment = (username: string, content: string) => `@${username} ${content}`

export function ClipMeTab({ onClose }: ClipMeTabProps) {
  const { user, chats } = useMessengerStore()
  const [videos, setVideos] = useState<ClipMeVideo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [description, setDescription] = useState('')
  const [privacy, setPrivacy] = useState<ClipMePrivacy>('PUBLIC')
  const [isUploading, setIsUploading] = useState(false)
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
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const messmeChats = useMemo(() => chats.filter(c => !c.gameMode), [chats])

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
    const nextVideos = result.videos ?? []
    setVideos(nextVideos)
    setIsLoading(false)
    void hydrateAuthorMeta(nextVideos)
  }

  useEffect(() => { void refreshFeed() }, [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setIsUploading(true)
    try {
      const uploaded = await clipMeAPI.uploadClipVideo(file)
      if (!uploaded.url) return
      const created = await clipMeAPI.createVideo(uploaded.url, description, privacy)
      if (created.video) {
        setVideos(prev => [created.video!, ...prev])
        setDescription('')
      }
    } finally {
      setIsUploading(false)
    }
  }

  const toggleLike = async (video: ClipMeVideo) => {
    const result = await clipMeAPI.toggleLike(video.id)
    if (result.liked === undefined || result.likesCount === undefined) return
    setVideos(prev => prev.map(v => v.id === video.id ? { ...v, likedByMe: result.liked!, likesCount: result.likesCount! } : v))
  }

  const toggleRepost = async (video: ClipMeVideo) => {
    const result = await clipMeAPI.toggleRepost(video.id)
    if (result.reposted === undefined || result.repostsCount === undefined) return
    setVideos(prev => prev.map(v => v.id === video.id ? { ...v, repostedByMe: result.reposted!, repostsCount: result.repostsCount! } : v))
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
  }

  const sendToMessme = async (targetChatId: string) => {
    if (!shareVideo) return
    const clipUrl = `${window.location.origin}/?clip=${encodeURIComponent(shareVideo.id)}`
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

  const myVideosCount = useMemo(() => videos.filter(v => v.user.id === user?.id).length, [videos, user?.id])

  return (
    <div className="h-full min-h-0 md:fixed md:inset-0 md:z-40 md:flex md:items-center md:justify-center md:bg-black/45 md:backdrop-blur-sm md:p-4">
      <div className="h-full min-h-0 flex flex-col bg-white dark:bg-[#111112] md:rounded-3xl md:w-[min(920px,94vw)] md:h-[90vh] md:border md:border-white/10 md:shadow-2xl overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div className="rounded-2xl p-4 bg-gradient-to-r from-[#5d6cf5] via-[#8b97ff] to-[#d573ff] text-white">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-lg font-bold">ClipMe</p>
                <p className="text-sm text-white/90">Короткие ролики для поднятия настроения в скучных буднях</p>
                <p className="text-xs text-white/75 mt-1">Мои ролики: {myVideosCount}</p>
              </div>
              {onClose && (
                <button
                  onClick={onClose}
                  className="hidden md:flex h-8 w-8 rounded-full bg-white/20 hover:bg-white/30 items-center justify-center"
                  title="Закрыть ClipMe"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
          {isLoading && <div className="text-sm opacity-60 px-1">Загрузка ленты...</div>}
          {!isLoading && videos.length === 0 && <div className="text-sm opacity-60 px-1">Пока нет видео.</div>}
          {videos.map(video => {
            const authorSubKey = video.user.id
            const isSubscribed = subscribedByAuthor[authorSubKey] ?? false
            return (
              <div key={video.id} className="rounded-2xl border border-black/[0.06] dark:border-white/[0.1] overflow-hidden bg-white dark:bg-[#15151a]">
                <div className="flex items-center justify-between p-3">
                  <button className="flex items-center gap-2 min-w-0 text-left" onClick={() => openChannel(video.user.id)}>
                    <Avatar className="h-8 w-8">
                      {video.user.avatarUrl && <AvatarImage src={video.user.avatarUrl} />}
                      <AvatarFallback className="bg-[#5d6cf5] text-white text-[10px]">{video.user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate flex items-center gap-1">
                        {video.user.username}
                        <UserRound className="h-3.5 w-3.5 opacity-60" />
                      </p>
                      <p className="text-xs opacity-60 flex items-center gap-1">
                        {PRIVACY_ICON[video.privacy]} {PRIVACY_LABEL[video.privacy]}
                      </p>
                    </div>
                  </button>
                  {video.user.id !== user?.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={async () => {
                        const result = await clipMeAPI.toggleSubscribe(video.user.id)
                        if (result.subscribed === undefined) return
                        applySubscribeResult(authorSubKey, result.subscribed, result.followersCount)
                      }}
                    >
                      {isSubscribed ? 'Вы подписаны' : 'Подписаться'}
                    </Button>
                  )}
                </div>
                <div className="relative bg-black">
                  <CustomVideoPlayer src={video.videoUrl} className="w-full max-h-[72vh] object-contain" />
                  <div className="absolute right-2 top-2 bottom-2 flex flex-col justify-center gap-2">
                    <button
                      onClick={() => toggleLike(video)}
                      className={cn('h-10 w-10 rounded-full text-sm flex items-center justify-center shadow-lg backdrop-blur', video.likedByMe ? 'bg-red-500/85 text-white' : 'bg-black/45 text-white')}
                      title="Лайк"
                    >
                      <Heart className={cn('h-4 w-4', video.likedByMe && 'fill-current')} />
                    </button>
                    <span className="text-[10px] text-white text-center -mt-1">{video.likesCount}</span>
                    <button
                      onClick={() => openComments(video.id)}
                      className="h-10 w-10 rounded-full text-sm flex items-center justify-center bg-black/45 text-white shadow-lg backdrop-blur"
                      title="Комментарии"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                    <span className="text-[10px] text-white text-center -mt-1">{video.commentsCount}</span>
                    <button
                      onClick={() => toggleRepost(video)}
                      className={cn('h-10 w-10 rounded-full text-sm flex items-center justify-center shadow-lg backdrop-blur', video.repostedByMe ? 'bg-[#5d6cf5] text-white' : 'bg-black/45 text-white')}
                      title="Репост"
                    >
                      <Repeat2 className="h-4 w-4" />
                    </button>
                    <span className="text-[10px] text-white text-center -mt-1">{video.repostsCount}</span>
                    <button
                      onClick={() => setShareVideo(video)}
                      className="h-10 w-10 rounded-full text-sm flex items-center justify-center bg-black/45 text-white shadow-lg backdrop-blur"
                      title="В Messme"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  {video.description && <p className="text-sm mb-2 whitespace-pre-wrap">{video.description}</p>}
                  <div className="text-[11px] opacity-60">
                    Подписчики автора: {followersByAuthor[authorSubKey] ?? '—'}
                  </div>
                  {commentsOpenFor === video.id && (
                    <div className="mt-3 border-t border-black/[0.06] dark:border-white/[0.08] pt-3 space-y-2">
                      {replyTargetByVideo[video.id] && (
                        <div className="flex items-center justify-between rounded-lg bg-[#5d6cf5]/10 text-xs px-2.5 py-1.5">
                          <span>Ответ для @{replyTargetByVideo[video.id]?.user.username}</span>
                          <button onClick={() => setReplyTargetByVideo(prev => ({ ...prev, [video.id]: null }))}>
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Input
                          value={commentDrafts[video.id] ?? ''}
                          onChange={e => setCommentDrafts(prev => ({ ...prev, [video.id]: e.target.value }))}
                          placeholder={replyTargetByVideo[video.id] ? 'Напишите ответ...' : 'Комментарий'}
                          className="h-9"
                        />
                        <Button size="sm" onClick={() => addComment(video.id)}>Отпр.</Button>
                      </div>
                      <div className="space-y-2 max-h-52 overflow-y-auto">
                        {(comments[video.id] ?? []).map(comment => (
                          <div key={comment.id} className="text-sm bg-black/[0.04] dark:bg-white/[0.05] rounded-lg px-2 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold opacity-80">{comment.user.username}</p>
                              <button
                                onClick={() => setReplyTargetByVideo(prev => ({ ...prev, [video.id]: comment }))}
                                className="text-[11px] text-[#5d6cf5] hover:underline"
                              >
                                Ответить
                              </button>
                            </div>
                            <p>{comment.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="border-t border-black/[0.06] dark:border-white/[0.08] bg-white/65 dark:bg-[#111112]/70 backdrop-blur-xl px-3 py-2">
          <div className="rounded-2xl bg-black/[0.04] dark:bg-white/[0.08] p-2.5 flex flex-col md:flex-row md:items-center gap-2">
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Описание ролика"
              className="bg-white/80 dark:bg-[#15151a]/80"
            />
            <div className="flex items-center gap-2">
              <select
                value={privacy}
                onChange={e => setPrivacy(e.target.value as ClipMePrivacy)}
                className="h-9 rounded-lg border border-black/[0.1] dark:border-white/[0.1] bg-transparent px-2 text-sm"
              >
                <option value="PUBLIC">Публично</option>
                <option value="FOLLOWERS">Только подписчики</option>
                <option value="PRIVATE">Только я</option>
              </select>
              <Button onClick={() => uploadInputRef.current?.click()} disabled={isUploading} className="bg-[#5d6cf5] hover:bg-[#4a5be0]">
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Добавить</>}
              </Button>
              <input ref={uploadInputRef} type="file" accept="video/*" className="hidden" onChange={handleUpload} />
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!shareVideo} onOpenChange={open => !open && setShareVideo(null)}>
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

      <Dialog open={!!activeChannelUserId} onOpenChange={open => !open && setActiveChannelUserId(null)}>
        <DialogContent className="max-w-2xl bg-white dark:bg-[#15151a] border-black/[0.08] dark:border-white/[0.08]">
          <DialogTitle>Канал ClipMe</DialogTitle>
          {channelLoading ? (
            <div className="py-10 text-sm opacity-60 text-center">Загрузка канала...</div>
          ) : !channelData?.user ? (
            <div className="py-10 text-sm opacity-60 text-center">Канал недоступен</div>
          ) : (
            <div className="space-y-3 max-h-[72vh] overflow-y-auto pr-1">
              <div className="flex items-center justify-between gap-3 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] p-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar className="h-10 w-10">
                    {channelData.user.avatarUrl && <AvatarImage src={channelData.user.avatarUrl} />}
                    <AvatarFallback className="bg-[#5d6cf5] text-white text-xs font-semibold">{channelData.user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{channelData.user.username}</p>
                    <p className="text-xs opacity-60">Подписчики: {channelData.followersCount ?? 0} · Подписок: {channelData.followingCount ?? 0}</p>
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
              {(channelData.videos ?? []).length === 0 ? (
                <p className="text-sm opacity-60 text-center py-6">В канале пока нет роликов</p>
              ) : (
                (channelData.videos ?? []).map(video => (
                  <div key={video.id} className="rounded-2xl overflow-hidden border border-black/[0.08] dark:border-white/[0.1] bg-black">
                    <CustomVideoPlayer src={video.videoUrl} className="w-full max-h-[60vh] object-contain" />
                    <div className="p-2.5 bg-white dark:bg-[#1a1a20]">
                      {video.description && <p className="text-sm mb-1.5">{video.description}</p>}
                      <p className="text-xs opacity-65">❤️ {video.likesCount} · 💬 {video.commentsCount} · 🔁 {video.repostsCount}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
