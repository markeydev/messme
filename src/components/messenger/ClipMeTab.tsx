'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { clipMeAPI, chatsAPI, type ClipMeComment, type ClipMePrivacy, type ClipMeVideo } from '@/lib/api'
import { useMessengerStore } from '@/lib/store'
import { messengerSocket } from '@/lib/socket'
import { Heart, MessageCircle, Repeat2, Plus, Send, Loader2, Lock, Users, Globe2 } from 'lucide-react'
import { cn } from '@/lib/utils'

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

export function ClipMeTab() {
  const { user, chats, addChat } = useMessengerStore()
  const [videos, setVideos] = useState<ClipMeVideo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [description, setDescription] = useState('')
  const [privacy, setPrivacy] = useState<ClipMePrivacy>('PUBLIC')
  const [isUploading, setIsUploading] = useState(false)
  const [commentsOpenFor, setCommentsOpenFor] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, ClipMeComment[]>>({})
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [subscribedByAuthor, setSubscribedByAuthor] = useState<Record<string, boolean>>({})
  const [followersByAuthor, setFollowersByAuthor] = useState<Record<string, number>>({})
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const refreshFeed = async () => {
    setIsLoading(true)
    const result = await clipMeAPI.getFeed()
    setVideos(result.videos ?? [])
    setIsLoading(false)
  }

  useEffect(() => { refreshFeed() }, [])

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
    const result = await clipMeAPI.addComment(videoId, text)
    if (!result.comment) return
    setComments(prev => ({ ...prev, [videoId]: [result.comment!, ...(prev[videoId] ?? [])] }))
    setCommentDrafts(prev => ({ ...prev, [videoId]: '' }))
    setVideos(prev => prev.map(v => v.id === videoId ? { ...v, commentsCount: result.commentsCount ?? v.commentsCount + 1 } : v))
  }

  const shareToMessme = async (video: ClipMeVideo) => {
    const targetChat = chats.find(c => !c.gameMode)
    if (!targetChat || !user) return
    const clipUrl = `${window.location.origin}/?clip=${encodeURIComponent(video.id)}`
    const sent = await chatsAPI.sendMessage(targetChat.id, `ClipMe: ${clipUrl}`)
    if (sent.message) messengerSocket.broadcastMessage(sent.message)
  }

  const myVideosCount = useMemo(() => videos.filter(v => v.user.id === user?.id).length, [videos, user?.id])

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-4 pt-4 pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="rounded-2xl p-4 bg-gradient-to-r from-[#5d6cf5] via-[#8b97ff] to-[#d573ff] text-white">
          <p className="text-lg font-bold">ClipMe</p>
          <p className="text-sm text-white/90">Короткие видео, лайки, репосты, комментарии и подписки — как в рилсах.</p>
          <p className="text-xs text-white/75 mt-1">Мои ролики: {myVideosCount}</p>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <Input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Описание ролика"
            className="bg-white dark:bg-[#15151a]"
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
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Добавить видео</>}
            </Button>
            <input ref={uploadInputRef} type="file" accept="video/*" className="hidden" onChange={handleUpload} />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
        {isLoading && <div className="text-sm opacity-60 px-1">Загрузка ленты...</div>}
        {!isLoading && videos.length === 0 && <div className="text-sm opacity-60 px-1">Пока нет видео.</div>}
        {videos.map(video => {
          const authorSubKey = video.user.id
          return (
            <div key={video.id} className="rounded-2xl border border-black/[0.06] dark:border-white/[0.1] overflow-hidden bg-white dark:bg-[#15151a]">
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="h-8 w-8">
                    {video.user.avatarUrl && <AvatarImage src={video.user.avatarUrl} />}
                    <AvatarFallback className="bg-[#5d6cf5] text-white text-[10px]">{video.user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{video.user.username}</p>
                    <p className="text-xs opacity-60 flex items-center gap-1">
                      {PRIVACY_ICON[video.privacy]} {PRIVACY_LABEL[video.privacy]}
                    </p>
                  </div>
                </div>
                {video.user.id !== user?.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={async () => {
                      const result = await clipMeAPI.toggleSubscribe(video.user.id)
                      if (result.subscribed === undefined) return
                      setSubscribedByAuthor(prev => ({ ...prev, [authorSubKey]: result.subscribed! }))
                      if (typeof result.followersCount === 'number') {
                        setFollowersByAuthor(prev => ({ ...prev, [authorSubKey]: result.followersCount! }))
                      }
                    }}
                  >
                    {(subscribedByAuthor[authorSubKey] ?? false) ? 'Вы подписаны' : 'Подписаться'}
                  </Button>
                )}
              </div>
              <div className="bg-black">
                <video src={video.videoUrl} controls playsInline className="w-full max-h-[68vh] object-contain" />
              </div>
              <div className="p-3">
                {video.description && <p className="text-sm mb-2 whitespace-pre-wrap">{video.description}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => toggleLike(video)} className={cn('h-8 px-3 rounded-lg text-sm flex items-center gap-1', video.likedByMe ? 'bg-red-500/15 text-red-500' : 'bg-black/[0.05] dark:bg-white/[0.08]')}>
                    <Heart className="h-4 w-4" /> {video.likesCount}
                  </button>
                  <button onClick={() => toggleRepost(video)} className={cn('h-8 px-3 rounded-lg text-sm flex items-center gap-1', video.repostedByMe ? 'bg-[#5d6cf5]/15 text-[#5d6cf5]' : 'bg-black/[0.05] dark:bg-white/[0.08]')}>
                    <Repeat2 className="h-4 w-4" /> {video.repostsCount}
                  </button>
                  <button onClick={() => openComments(video.id)} className="h-8 px-3 rounded-lg text-sm flex items-center gap-1 bg-black/[0.05] dark:bg-white/[0.08]">
                    <MessageCircle className="h-4 w-4" /> {video.commentsCount}
                  </button>
                  <button onClick={() => shareToMessme(video)} className="h-8 px-3 rounded-lg text-sm flex items-center gap-1 bg-black/[0.05] dark:bg-white/[0.08]">
                    <Send className="h-4 w-4" /> В Messme
                  </button>
                </div>
                <div className="mt-2 text-[11px] opacity-60">
                  Подписчики автора: {followersByAuthor[authorSubKey] ?? '—'}
                </div>
                {commentsOpenFor === video.id && (
                  <div className="mt-3 border-t border-black/[0.06] dark:border-white/[0.08] pt-3 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={commentDrafts[video.id] ?? ''}
                        onChange={e => setCommentDrafts(prev => ({ ...prev, [video.id]: e.target.value }))}
                        placeholder="Комментарий"
                        className="h-9"
                      />
                      <Button size="sm" onClick={() => addComment(video.id)}>Отпр.</Button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {(comments[video.id] ?? []).map(comment => (
                        <div key={comment.id} className="text-sm bg-black/[0.04] dark:bg-white/[0.05] rounded-lg px-2 py-1.5">
                          <p className="text-xs font-semibold opacity-80">{comment.user.username}</p>
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
    </div>
  )
}
