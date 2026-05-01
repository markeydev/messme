'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { chatsAPI, type MessageComment } from '@/lib/api'
import { useMessengerStore } from '@/lib/store'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ArrowLeft, Loader2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VerifiedBadge } from './VerifiedBadge'

interface PostCommentsProps {
  chatId: string
  messageId: string
  /** Post preview — first line of content for the header */
  postPreview: string
  onClose: () => void
  initialCount: number
  onCountChange: (messageId: string, count: number) => void
}

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase()
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'только что'
  if (diffMin < 60) return `${diffMin} мин.`
  if (diffMin < 1440) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

export function PostComments({ chatId, messageId, postPreview, onClose, initialCount, onCountChange }: PostCommentsProps) {
  const user = useMessengerStore(s => s.user)
  const [comments, setComments] = useState<MessageComment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [count, setCount] = useState(initialCount)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (cursor?: string) => {
    if (!cursor) setIsLoading(true)
    else setIsLoadingMore(true)
    const res = await chatsAPI.getMessageComments(chatId, messageId, cursor)
    if (res.comments) {
      setComments(prev => cursor ? [...prev, ...res.comments!] : res.comments!)
      setHasMore(res.hasMore ?? false)
      setNextCursor(res.nextCursor ?? null)
    }
    setIsLoading(false)
    setIsLoadingMore(false)
  }, [chatId, messageId])

  useEffect(() => { void load() }, [load])

  // Infinite scroll — load older comments above
  useEffect(() => {
    if (!loadMoreRef.current) return
    const obs = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && hasMore && !isLoadingMore) void load(nextCursor ?? undefined)
    }, { threshold: 0.1 })
    obs.observe(loadMoreRef.current)
    return () => obs.disconnect()
  }, [hasMore, isLoadingMore, nextCursor, load])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [text])

  const handleSend = async () => {
    const content = text.trim()
    if (!content || isSending || !user) return
    setIsSending(true)
    const res = await chatsAPI.postMessageComment(chatId, messageId, content)
    if (res.comment) {
      setComments(prev => [...prev, res.comment!])
      const newCount = res.commentsCount ?? count + 1
      setCount(newCount)
      onCountChange(messageId, newCount)
      setText('')
      // Scroll to bottom
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
    }
    setIsSending(false)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111112]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 min-h-14 border-b border-black/[0.06] dark:border-white/[0.08] flex-shrink-0">
        <button
          onClick={onClose}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-black/40 dark:text-white/40 hover:text-black/80 dark:hover:text-white/80 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-black dark:text-white">Комментарии</p>
          {postPreview && (
            <p className="text-xs text-black/40 dark:text-white/40 truncate">{postPreview}</p>
          )}
        </div>
        <span className="text-xs text-black/30 dark:text-white/30 flex-shrink-0">{count}</span>
      </div>

      {/* Comment list */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {/* Load-more sentinel (top) */}
        {hasMore && (
          <div ref={loadMoreRef} className="flex justify-center py-1">
            {isLoadingMore && <Loader2 className="h-4 w-4 animate-spin text-black/20 dark:text-white/20" />}
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-black/20 dark:text-white/20" />
          </div>
        )}

        {!isLoading && comments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-black/25 dark:text-white/25">
            <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm">Будьте первым, кто оставит комментарий</p>
          </div>
        )}

        {comments.map(c => {
          const isOwn = c.user.id === user?.id
          return (
            <div key={c.id} className={cn('flex gap-2.5 items-start', isOwn && 'flex-row-reverse')}>
              <Avatar className="h-7 w-7 flex-shrink-0 mt-0.5">
                {c.user.avatarUrl && <AvatarImage src={c.user.avatarUrl} alt={c.user.username} />}
                <AvatarFallback className={cn('text-[10px] text-white font-medium', isOwn ? 'bg-[#5D6CF5]' : 'bg-black/25 dark:bg-white/20')}>
                  {getInitials(c.user.username)}
                </AvatarFallback>
              </Avatar>
              <div className={cn('max-w-[75%]', isOwn && 'items-end flex flex-col')}>
                <div className={cn(
                  'rounded-2xl px-3 py-2 text-sm break-words',
                  isOwn
                    ? 'bg-[#5D6CF5] text-white rounded-br-sm'
                    : 'bg-[#f0f1fe] dark:bg-[#1e1e24] text-black dark:text-white rounded-bl-sm'
                )}>
                  {!isOwn && (
                    <p className="text-[10px] font-semibold text-[#5D6CF5] mb-0.5 inline-flex items-center gap-1">
                      {c.user.username}
                      {c.user.isBadgeVerified && <VerifiedBadge className="h-2.5 w-2.5 min-h-2.5 min-w-2.5" />}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap leading-relaxed">{c.content}</p>
                </div>
                <p className={cn('text-[10px] mt-0.5 px-1', isOwn ? 'text-black/30 dark:text-white/30' : 'text-black/25 dark:text-white/25')}>
                  {formatDate(c.createdAt)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-3 py-2 border-t border-black/[0.06] dark:border-white/[0.08] flex items-end gap-2">
        <Avatar className="h-7 w-7 flex-shrink-0 mb-1">
          {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.username} />}
          <AvatarFallback className="bg-[#5D6CF5] text-white text-[10px] font-medium">
            {user ? getInitials(user.username) : '?'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 bg-black/[0.05] dark:bg-white/[0.08] rounded-2xl flex items-end px-3 py-1.5 gap-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Написать комментарий…"
            rows={1}
            className="flex-1 bg-transparent text-sm text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 resize-none outline-none leading-relaxed min-h-[20px] max-h-[120px] overflow-y-auto"
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || isSending}
            className="h-7 w-7 rounded-full bg-[#5D6CF5] disabled:opacity-40 flex items-center justify-center flex-shrink-0 transition-opacity mb-0.5"
          >
            {isSending
              ? <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
              : <Send className="h-3.5 w-3.5 text-white" />
            }
          </button>
        </div>
      </div>
    </div>
  )
}
