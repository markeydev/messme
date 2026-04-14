'use client'

import { useEffect, useRef, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { MessageInput } from './MessageInput'
import { VoiceMessage } from './VoiceMessage'
import { VideoNote } from './VideoNote'
import { GroupSettingsDialog } from './GroupSettingsDialog'
import { CallWindow } from './CallWindow'
import { StoryViewer } from './StoryViewer'
import { VerifiedBadge } from './VerifiedBadge'
import { useMessengerStore } from '@/lib/store'
import { messengerSocket } from '@/lib/socket'
import { chatsAPI, usersAPI, storiesAPI, type Chat, type Message, type StoryFeedItem, type User } from '@/lib/api'
import { ArrowDown, ArrowLeft, Users, Loader2, UserPlus, Check, X, Reply, Forward, Trash2, Pencil, FileText, Download, ZoomIn, Copy, Bell, BellOff, Phone, Clock, AlertCircle, ShieldCheck } from 'lucide-react'
import { cn, openExternalUrl } from '@/lib/utils'

interface ChatWindowProps {
  chat: Chat
  messages: Message[]
  onBack?: () => void
  isMobile?: boolean
}

export function ChatWindow({ chat, messages, onBack, isMobile }: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map())
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<User[]>([])
  const [selectedUsers, setSelectedUsers] = useState<User[]>([])
  const [isAddingMembers, setIsAddingMembers] = useState(false)
  const [chatMembers, setChatMembers] = useState(chat.members)

  // Context-menu actions state
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null)
  const [replyToText, setReplyToText] = useState('')
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  const [editingText, setEditingText] = useState('')
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null)
  const [isForwardOpen, setIsForwardOpen] = useState(false)
  const [isForwarding, setIsForwarding] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false)
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ msg: Message; x: number; y: number } | null>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Call state
  const [activeCall, setActiveCall] = useState<{
    remoteUserId: string
    remoteUsername: string
    role: 'caller' | 'callee'
    withVideo: boolean
    incomingOffer?: RTCSessionDescriptionInit
  } | null>(null)
  const [activeStoryUserId, setActiveStoryUserId] = useState<string | null>(null)
  const [storyInfo, setStoryInfo] = useState<StoryFeedItem | null>(null)

  const { user, addMessage, deleteMessage, chats, mutedChats, toggleMuteChat, removeChat, setActiveChat, prependMessages, updateChatMembers } = useMessengerStore()

  // Infinite scroll state
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const hasMore = (chats.find(c => c.id === chat.id) as any)?.hasMore ?? false

  const loadMoreMessages = async () => {
    if (isLoadingMore || !hasMore || messages.length === 0) return
    const oldest = messages[0]
    setIsLoadingMore(true)
    const el = scrollRef.current
    const prevScrollHeight = el?.scrollHeight ?? 0
    const result = await chatsAPI.getMessages(chat.id, oldest.id)
    if (result.messages && result.messages.length > 0) {
      prependMessages(chat.id, result.messages, result.hasMore ?? false)
      // Restore scroll position so viewport doesn't jump
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevScrollHeight
      })
    } else {
      // No more messages — mark as exhausted
      prependMessages(chat.id, [], false)
    }
    setIsLoadingMore(false)
  }

  // On initial load, mark hasMore based on whether we received exactly 100 messages
  useEffect(() => {
    if (messages.length > 0) {
      const chatInStore = chats.find(c => c.id === chat.id)
      if ((chatInStore as any)?.hasMore === undefined) {
        prependMessages(chat.id, [], messages.length >= 100)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id])

  // Reflect store updates for group title/avatar/members
  const currentChat = chats.find(c => c.id === chat.id) ?? chat
  const peerUserId = !chat.isGroup ? currentChat.members.find(m => m.id !== user?.id)?.id ?? null : null
  const peerMember = !chat.isGroup ? currentChat.members.find(m => m.id !== user?.id) : null

  useEffect(() => {
    if (chat.isGroup || !peerUserId) {
      setStoryInfo(null)
      return
    }
    let cancelled = false
    storiesAPI.getFeed().then(result => {
      if (cancelled) return
      const entry = (result.users ?? []).find(item => item.user.id === peerUserId) ?? null
      setStoryInfo(entry)
    })
    return () => { cancelled = true }
  }, [chat.isGroup, peerUserId, chat.id])

  // Keep chatMembers in sync with store (avatar / profile changes propagate here)
  useEffect(() => {
    setChatMembers(currentChat.members)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChat.members])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  useEffect(() => {
    if (!scrollRef.current) return
    const el = scrollRef.current
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight
      setShowScrollBtn(false)
    } else {
      setShowScrollBtn(true)
    }
  }, [messages.length])

  useEffect(() => {
    const handleTyping = (data: { chatId: string; userId: string; username: string; isTyping: boolean }) => {
      if (data.chatId === chat.id) {
        setTypingUsers(prev => {
          const next = new Map(prev)
          if (data.isTyping) next.set(data.userId, data.username)
          else next.delete(data.userId)
          return next
        })
      }
    }
    const handleMembersAdded = (data: { chatId: string; members: User[] }) => {
      if (data.chatId === chat.id) setChatMembers(prev => [...prev, ...data.members])
    }
    messengerSocket.on('user-typing', handleTyping)
    messengerSocket.on('members-added', handleMembersAdded)
    return () => {
      messengerSocket.off('user-typing', handleTyping)
      messengerSocket.off('members-added', handleMembersAdded)
    }
  }, [chat.id])


  const handleUserSearch = async (query: string) => {
    setUserSearchQuery(query)
    if (query.length >= 2) {
      const result = await usersAPI.search(query)
      if (result.users) {
        const existingIds = new Set(chatMembers.map(m => m.id))
        setSearchResults(result.users.filter(u => !existingIds.has(u.id)))
      }
    } else setSearchResults([])
  }

  const toggleUserSelection = (u: User) =>
    setSelectedUsers(prev => prev.some(x => x.id === u.id) ? prev.filter(x => x.id !== u.id) : [...prev, u])

  const handleAddMembers = async () => {
    if (selectedUsers.length === 0) return
    setIsAddingMembers(true)
    try {
      const result = await chatsAPI.addMembers(chat.id, selectedUsers.map(u => u.id))
      if (result.newMembers && result.newMembers.length > 0) {
        const merged = [...chatMembers, ...result.newMembers]
        setChatMembers(merged)
        updateChatMembers(chat.id, merged)
        if (result.memberIds) messengerSocket.notifyMembersAdded(chat.id, result.newMembers, result.memberIds)
      }
    } catch (err) {
      console.error('Add members failed:', err)
    } finally {
      setIsAddMemberOpen(false)
      setSelectedUsers([])
      setUserSearchQuery('')
      setSearchResults([])
      setIsAddingMembers(false)
    }
  }

  const formatTime = (date?: string | Date | null) => {
    try {
      const d = new Date(date ?? '')
      return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }
  const handleDeleteMessage = async (messageId: string) => {
    const result = await chatsAPI.deleteMessage(chat.id, messageId)
    if (!result.error) {
      deleteMessage(chat.id, messageId)
      messengerSocket.broadcastDeleteMessage(chat.id, messageId)
    }
  }

  const handleStartReply = (msg: Message) => {
    setReplyToMessage(msg)
    setReplyToText(msg.content)
  }

  const handleStartEdit = (msg: Message) => {
    setEditingMessage(msg)
    setEditingText(msg.content)
  }

  const handleForward = async (targetChatId: string) => {
    if (!forwardMessage || !user) return
    setIsForwarding(true)
    try {
      const originalSender = getSender(forwardMessage.senderId)
      const senderName = forwardMessage.senderUsername ?? originalSender?.username ?? 'Неизвестно'
      const result = await chatsAPI.sendMessage(
        targetChatId,
        forwardMessage.content,
        undefined,
        { isForwarded: true, forwardedFromUsername: senderName },
      )
      if (result.message) messengerSocket.broadcastMessage(result.message)
    } catch (err) {
      console.error('Forward failed:', err)
    }
    setIsForwarding(false)
    setIsForwardOpen(false)
    setForwardMessage(null)
  }
  const formatDate = (date?: string | Date | null) => {
    if (!date) return ''
    try {
      const d = new Date(date)
      return isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    } catch { return '' }
  }

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const renderTextWithLinks = (text: string) => {
    const parts = text.split(/(https?:\/\/[^\s]+)/g)
    return parts.map((part, idx) => {
      if (!/^https?:\/\//i.test(part)) return <span key={idx}>{part}</span>
      return (
        <a
          key={idx}
          href={part}
          className="underline underline-offset-2 break-all"
          onClick={e => {
            e.preventDefault()
            openExternalUrl(part)
          }}
        >
          {part}
        </a>
      )
    })
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} Б`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
  }

  const getSender = (senderId: string) => chatMembers.find(m => m.id === senderId)

  const groupedMessages = messages.reduce((groups, msg) => {
    const key = formatDate(msg.createdAt) || 'Сегодня'
    if (!groups[key]) groups[key] = []
    groups[key].push(msg)
    return groups
  }, {} as Record<string, Message[]>)

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111112]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 min-h-16 border-b border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#111112] flex-shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {isMobile && (
          <Button variant="ghost" size="icon" onClick={onBack}
            className="h-8 w-8 text-black/40 dark:text-white/40 hover:text-black/80 dark:hover:text-white/80 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] rounded-lg -ml-1">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        {chat.isGroup ? (
          <button
            onClick={() => setIsGroupSettingsOpen(true)}
            className="rounded-full hover:ring-2 hover:ring-[#5D6CF5]/50 transition-all flex-shrink-0"
            title="Настройки группы"
          >
            <Avatar className="h-9 w-9">
              {currentChat.avatarUrl && <AvatarImage src={currentChat.avatarUrl} alt={currentChat.title} />}
              <AvatarFallback className={cn('text-white font-medium text-sm', 'bg-[#5D6CF5]')}>
                <Users className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
          </button>
        ) : (
          <button
            onClick={() => {
              if (peerUserId && storyInfo) setActiveStoryUserId(peerUserId)
              else setIsUserProfileOpen(true)
            }}
            className="rounded-full hover:ring-2 hover:ring-[#5D6CF5]/50 transition-all flex-shrink-0"
            title={storyInfo ? 'Открыть сторис' : 'Профиль собеседника'}
          >
            <span className={cn(
              'inline-flex rounded-full p-[2px]',
              storyInfo
                ? storyInfo.hasUnseen
                  ? 'bg-gradient-to-br from-[#ff4d67] via-[#f7b142] to-[#5d6cf5]'
                  : 'bg-black/15 dark:bg-white/15'
                : ''
            )}>
              <Avatar className="h-9 w-9">
                {currentChat.avatarUrl && <AvatarImage src={currentChat.avatarUrl} alt={currentChat.title} />}
                <AvatarFallback className={cn('text-white font-medium text-sm', 'bg-[#5D6CF5]')}>
                  {getInitials(chat.title)}
                </AvatarFallback>
              </Avatar>
            </span>
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-black dark:text-white text-sm truncate">{currentChat.title}</h3>
            {peerMember?.isBadgeVerified && <VerifiedBadge className="flex-shrink-0" />}
            {chat.isGroup && (
              <span className="text-xs text-black/30 dark:text-white/30">{chatMembers.length} участников</span>
            )}
          </div>
          <div className="flex items-center gap-1 text-black/30 dark:text-white/30 text-xs">
            <ShieldCheck className="h-2.5 w-2.5" />
            <span>Encrypted</span>
          </div>
        </div>
        {chat.isGroup && (
          <Button variant="ghost" size="icon" onClick={() => setIsAddMemberOpen(true)}
              className="h-8 w-8 text-black/40 dark:text-white/40 hover:text-black/80 dark:hover:text-white/80 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] rounded-lg">
            <UserPlus className="h-4 w-4" />
          </Button>
        )}
        {chat.isGroup && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => toggleMuteChat(chat.id)}
            className="h-8 w-8 text-black/40 dark:text-white/40 hover:text-black/80 dark:hover:text-white/80 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] rounded-lg"
            title={mutedChats[chat.id] ? 'Включить уведомления' : 'Отключить уведомления'}
          >
            {mutedChats[chat.id] ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          </Button>
        )}
        {/* Call buttons — only for 1-on-1 chats */}
        {!chat.isGroup && (() => {
          const remote = chatMembers.find(m => m.id !== user?.id)
          if (!remote) return null
          return (
            <>
              <Button variant="ghost" size="icon"
                onClick={() => setActiveCall({ remoteUserId: remote.id, remoteUsername: remote.username, role: 'caller', withVideo: false })}
                className="h-8 w-8 text-black/40 dark:text-white/40 hover:text-black/80 dark:hover:text-white/80 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] rounded-lg"
                title="Аудиозвонок"
              >
                <Phone className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon"
                onClick={() => setActiveCall({ remoteUserId: remote.id, remoteUsername: remote.username, role: 'caller', withVideo: true })}
                className="h-8 w-8 text-black/40 dark:text-white/40 hover:text-black/80 dark:hover:text-white/80 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] rounded-lg"
                title="Видеозвонок"
              >
                <svg className="h-4 w-4" viewBox="10.5 13.5 23.5 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14.7051 28.8877C13.7617 28.8877 13.0293 28.6416 12.5078 28.1494C11.9922 27.6631 11.7344 26.9541 11.7344 26.0225V17.3301C11.7344 16.4043 12.001 15.6895 12.5342 15.1855C13.0732 14.6758 13.7969 14.4209 14.7051 14.4209H24.0391C24.9824 14.4209 25.7002 14.6758 26.1924 15.1855C26.6904 15.6895 26.9395 16.4043 26.9395 17.3301V25.9785C26.9395 26.9043 26.6787 27.6191 26.1572 28.123C25.6416 28.6328 24.9121 28.8877 23.9688 28.8877H14.7051ZM28.2227 24.458V18.877L31.2461 16.2842C31.4277 16.126 31.6094 16.0029 31.791 15.915C31.9785 15.8213 32.1631 15.7744 32.3447 15.7744C32.7021 15.7744 32.9922 15.8916 33.2148 16.126C33.4375 16.3545 33.5488 16.6621 33.5488 17.0488V26.2949C33.5488 26.6816 33.4375 26.9922 33.2148 27.2266C32.9922 27.4609 32.7021 27.5781 32.3447 27.5781C32.1631 27.5781 31.9785 27.5312 31.791 27.4375C31.6035 27.3438 31.4219 27.2207 31.2461 27.0684L28.2227 24.458Z" fill="currentColor"/>
                </svg>
              </Button>
            </>
          )
        })()}
      </div>

      {/* Messages */}
      <div className="relative flex-1 min-h-0">
      <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-4" onScroll={e => {
        const el = e.currentTarget
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
          setShowScrollBtn(false)
        }
        // Load older messages when user scrolls near the top
        if (el.scrollTop < 120) {
          loadMoreMessages()
        }
      }}>
        {isLoadingMore && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-black/30 dark:text-white/30" />
          </div>
        )}
        {!hasMore && messages.length > 0 && (
          <div className="flex justify-center py-2">
            <span className="text-xs text-black/20 dark:text-white/20">Начало переписки</span>
          </div>
        )}
        {Object.entries(groupedMessages).map(([date, msgs]) => (
          <div key={date}>
            <div className="flex items-center justify-center my-4">
              <span className="text-xs text-black/30 dark:text-white/30 bg-black/[0.06] dark:bg-white/[0.08] px-3 py-1.5 rounded-full shadow-sm">
                {date}
              </span>
            </div>
            <div className="space-y-1">
              {msgs.map((msg, i) => {
                const isOwn = msg.senderId === user?.id
                const sender = getSender(msg.senderId)
                const prevMsg = msgs[i - 1]
                const showAvatar = !prevMsg || prevMsg.senderId !== msg.senderId
                const showName = chat.isGroup && !isOwn && showAvatar

                return (
                  <div key={msg.id} className="animate-in fade-in slide-in-from-bottom-2 duration-150">
                      <div
                        className={cn('flex gap-2 items-end select-none', isOwn ? 'flex-row-reverse' : 'flex-row')}
                        onContextMenu={e => { e.preventDefault(); setContextMenu({ msg, x: e.clientX, y: e.clientY }) }}
                        onTouchStart={e => {
                          const touch = e.touches[0]
                          const tx = touch.clientX, ty = touch.clientY
                          longPressTimerRef.current = setTimeout(() => {
                            window.getSelection()?.removeAllRanges()
                            setContextMenu({ msg, x: tx, y: ty })
                          }, 500)
                        }}
                        onTouchEnd={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null } }}
                        onTouchMove={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null } }}
                      >
                        {showAvatar ? (
                          <Avatar className="h-7 w-7 flex-shrink-0 mb-0.5">
                            {isOwn
                              ? (user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.username} />)
                              : (sender?.avatarUrl && <AvatarImage src={sender.avatarUrl} alt={sender.username} />)
                            }
                            <AvatarFallback className={cn('text-[10px] text-white font-medium',
                              isOwn ? 'bg-[#5D6CF5]' : 'bg-black/[0.25]')}>
                              {sender ? getInitials(sender.username) : '?'}
                            </AvatarFallback>
                          </Avatar>
                        ) : <div className="w-7 flex-shrink-0" />}

                        <div className={cn(
                          'rounded-2xl px-3 py-2 shadow-sm',
                          'max-w-[min(72%,420px)] min-w-0 break-words',
                          (msg as any).type === 'VIDEO_NOTE'
                            ? 'p-0 bg-transparent border-0 shadow-none'
                            : isOwn
                              ? 'bg-[#5D6CF5] text-white rounded-br-sm'
                              : 'bg-[#f0f1fe] dark:bg-[#1e1e24] text-black dark:text-white rounded-bl-sm'
                        )}>
                          {/* Forwarded indicator */}
                          {(msg as any).isForwarded && (
                            <div className="flex items-center gap-1 mb-1.5">
                              <Forward className={cn('h-3 w-3', isOwn ? 'text-white/60' : 'text-black/40')} />
                              <span className={cn('text-[10px] italic', isOwn ? 'text-white/60' : 'text-black/40')}>
                                Переслано от <span className="font-semibold not-italic">{(msg as any).forwardedFromUsername}</span>
                              </span>
                            </div>
                          )}
                          {/* Reply quote */}
                          {(msg as any).replyTo && (
                            <div className={cn(
                              'mb-2 px-2 py-1 rounded-lg border-l-2',
                              isOwn ? 'bg-white/10 border-white/40' : 'bg-black/[0.06] dark:bg-white/[0.08] border-[#5D6CF5]/50'
                            )}>
                              <p className={cn('text-[10px] font-semibold mb-0.5', isOwn ? 'text-white/80' : 'text-[#5D6CF5]')}>
                                {(msg as any).replyTo.senderUsername ?? getSender((msg as any).replyTo.senderId)?.username}
                              </p>
                              <p className="text-[11px] opacity-70 line-clamp-2 break-words">
                                {(msg as any).replyTo.content}
                              </p>
                            </div>
                          )}
                          {showName && (
                            <p className="text-[11px] text-[#5D6CF5] font-semibold mb-1 inline-flex items-center gap-1">
                              {sender?.username}
                              {sender?.isBadgeVerified && <VerifiedBadge className="h-3 w-3 min-h-3 min-w-3" />}
                            </p>
                          )}
                          {/* Audio message */}
                          {(msg as any).type === 'AUDIO' && (msg as any).audioUrl ? (
                            <VoiceMessage
                              audioUrl={(msg as any).audioUrl}
                              duration={(msg as any).audioDuration}
                              isOwn={isOwn}
                            />
                          ) : (msg as any).type === 'VIDEO_NOTE' && (msg as any).videoNoteUrl ? (
                            /* Video note – circle player, no bubble padding */
                            <div>
                              <VideoNote
                                videoUrl={(msg as any).videoNoteUrl}
                                duration={(msg as any).videoNoteDuration}
                                isOwn={isOwn}
                              />
                              <p className={cn('text-[10px] select-none text-right mt-1',
                                isOwn ? 'text-white/60' : 'text-black/30 dark:text-white/40')}>
                                {formatTime(msg.createdAt)}
                              </p>
                            </div>
                          ) : (msg as any).type === 'IMAGE' && (msg as any).fileUrl ? (
                            /* Image message */
                            <div className="-mx-1">
                              <div
                                className="relative group cursor-pointer rounded-xl overflow-hidden"
                                onClick={() => setLightboxUrl((msg as any).fileUrl)}
                              >
                                <img
                                  src={(msg as any).fileUrl}
                                  alt={(msg as any).fileName || 'Изображение'}
                                  className="max-w-full max-h-64 w-auto object-cover block"
                                  loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                  <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                                </div>
                              </div>
                            </div>
                          ) : (msg as any).type === 'FILE' && (msg as any).fileUrl ? (
                            /* File message */
                            <a
                              href={(msg as any).fileUrl}
                              download={(msg as any).fileName}
                              className={cn(
                                'flex items-center gap-2.5 py-1 rounded-xl -mx-1 px-1 hover:bg-black/10 transition-colors group',
                              )}
                              onClick={e => {
                                e.preventDefault()
                                openExternalUrl((msg as any).fileUrl)
                              }}
                            >
                              <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0', isOwn ? 'bg-white/20' : 'bg-black/[0.08]')}>
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{(msg as any).fileName || 'Файл'}</p>
                                <p className={cn('text-xs', isOwn ? 'text-white/60' : 'text-black/30 dark:text-white/40')}>
                                  {formatFileSize((msg as any).fileSize || 0)}
                                </p>
                              </div>
                              <Download className={cn('h-4 w-4 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity', isOwn ? 'text-white' : 'text-black/40 dark:text-white/40')} />
                            </a>
                          ) : (
                            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                              {renderTextWithLinks(msg.content)}
                            </p>
                          )}
                          <div className={cn(
                            'flex items-center gap-1 justify-end mt-1',
                            (msg as any).type === 'VIDEO_NOTE' && 'hidden'
                          )}>
                            {(msg as any).isEdited && (
                              <span className={cn('text-[10px] select-none italic',
                                isOwn ? 'text-white/50' : 'text-black/30 dark:text-white/40')}>изм.</span>
                            )}
                            <p className={cn('text-[10px] select-none',
                              isOwn ? 'text-white/60' : 'text-black/30 dark:text-white/40')}>
                              {formatTime(msg.createdAt)}
                            </p>
                            {isOwn && (msg as any).pendingStatus === 'sending' && (
                              <Clock className="h-2.5 w-2.5 text-white/50 animate-pulse" />
                            )}
                            {isOwn && (msg as any).pendingStatus === 'failed' && (
                              <AlertCircle className="h-2.5 w-2.5 text-red-400" aria-label="Не отправлено" />
                            )}
                          </div>
                        </div>
                      </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {typingUsers.size > 0 && (
          <div className="flex items-center gap-2 py-2 px-4 text-black/30 dark:text-white/30 text-xs">
            <div className="flex gap-0.5 items-center bg-black/[0.05] dark:bg-white/[0.08] rounded-full px-3 py-2 shadow-sm">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-1.5 h-1.5 bg-[#5D6CF5] rounded-full animate-bounce"
                  style={{ animationDelay: `${d}ms` }} />
              ))}
              <span className="ml-2 text-black/40 dark:text-white/40">{Array.from(typingUsers.values()).join(', ')} печатает</span>
            </div>
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-[#5D6CF5]/[0.08] flex items-center justify-center mb-4">
              <ShieldCheck className="h-7 w-7 text-[#5D6CF5]/50" />
            </div>
            <p className="text-black dark:text-white font-medium">Начните диалог</p>
            <p className="text-black/40 dark:text-white/40 text-sm mt-1">Сообщения зашифрованы</p>
          </div>
        )}
      </div>
      {showScrollBtn && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={() => {
              if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
              setShowScrollBtn(false)
            }}
            className="flex items-center gap-2 px-4 h-9 rounded-2xl bg-white/80 dark:bg-white/[0.12] backdrop-blur-sm shadow-[0_5px_20px_rgba(0,0,0,0.15)] text-black dark:text-white text-sm font-medium"
          >
            <ArrowDown className="h-4 w-4 text-[#5D6CF5]" />
            Новые сообщения
          </button>
        </div>
      )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 min-w-0">
        <MessageInput
          chatId={chat.id}
          members={chatMembers}
          replyTo={replyToMessage ? { message: replyToMessage, text: replyToText } : null}
          onCancelReply={() => setReplyToMessage(null)}
          editingMessage={editingMessage}
          editingText={editingText}
          onCancelEdit={() => { setEditingMessage(null); setEditingText('') }}
          onEditDone={() => { setEditingMessage(null); setEditingText('') }}
        />
      </div>

      {/* Add Members Dialog */}
      <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
        <DialogContent className="bg-white dark:bg-[#1c1c1e] border-black/[0.08] dark:border-white/[0.08] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-black dark:text-white">Добавить участников</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="flex flex-wrap gap-1.5">
              {chatMembers.map(m => (
                <Badge key={m.id} className="bg-black/[0.05] dark:bg-white/[0.08] text-black/60 dark:text-white/60 border-black/[0.08] dark:border-white/[0.08] text-xs">
                  {m.username}
                </Badge>
              ))}
            </div>
            <Input placeholder="Поиск пользователей..." value={userSearchQuery}
              onChange={e => handleUserSearch(e.target.value)}
              className="bg-black/[0.05] dark:bg-white/[0.08] border-0 text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 rounded-xl h-10" />
            {searchResults.length > 0 && (
              <div className="bg-black/[0.04] dark:bg-white/[0.06] rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                {searchResults.map(u => (
                  <button key={u.id} onClick={() => toggleUserSelection(u)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-[#5D6CF5] text-white text-xs">{getInitials(u.username)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm flex-1 text-left text-black dark:text-white">{u.username}</span>
                    {selectedUsers.some(x => x.id === u.id) && <Check className="h-4 w-4 text-[#5D6CF5]" />}
                  </button>
                ))}
              </div>
            )}
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedUsers.map(u => (
                  <Badge key={u.id} className="bg-[#5D6CF5]/10 text-[#5D6CF5] border-[#5D6CF5]/20 cursor-pointer hover:bg-[#5D6CF5]/20"
                    onClick={() => toggleUserSelection(u)}>
                    {u.username} <X className="h-3 w-3 ml-1 inline" />
                  </Badge>
                ))}
              </div>
            )}
            <Button onClick={handleAddMembers} disabled={selectedUsers.length === 0 || isAddingMembers}
              className="w-full bg-[#5D6CF5] hover:bg-[#4a5be0] h-10 rounded-xl">
              {isAddingMembers ? 'Добавление...' : 'Добавить'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Forward Dialog */}
      <Dialog open={isForwardOpen} onOpenChange={open => { setIsForwardOpen(open); if (!open) setForwardMessage(null) }}>
        <DialogContent className="bg-white dark:bg-[#1c1c1e] border-black/[0.08] dark:border-white/[0.08] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-black dark:text-white">Переслать сообщение</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 mt-2 max-h-72 overflow-y-auto">
            {chats.filter(c => c.id !== chat.id).map(c => (
              <button key={c.id} onClick={() => handleForward(c.id)} disabled={isForwarding}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50 text-left">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className={cn('text-white text-xs font-medium',
                    c.isGroup ? 'bg-[#5D6CF5]' : 'bg-[#5D6CF5]')}>
                    {c.isGroup ? <Users className="h-3.5 w-3.5" /> : c.title.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm flex-1 truncate text-black dark:text-white">{c.title}</span>
                {isForwarding && <Loader2 className="h-4 w-4 animate-spin text-gray-500 flex-shrink-0" />}
              </button>
            ))}
            {chats.filter(c => c.id !== chat.id).length === 0 && (
              <p className="text-black/40 dark:text-white/40 text-sm text-center py-6">Нет других чатов для пересылки</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      <Dialog open={!!lightboxUrl} onOpenChange={open => { if (!open) setLightboxUrl(null) }}>
        <DialogContent className="bg-black/90 border-0 max-w-4xl p-2 flex items-center justify-center">
          {lightboxUrl && (
            <img
              src={lightboxUrl}
              alt="Полный размер"
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
      {/* Group Settings Dialog */}
      <GroupSettingsDialog
        chat={currentChat}
        open={isGroupSettingsOpen}
        onOpenChange={setIsGroupSettingsOpen}
        members={chatMembers}
        currentUserId={user?.id ?? ''}
        onLeave={() => {
          removeChat(chat.id)
          setActiveChat(null)
        }}
      />

      {/* User profile overlay (private chats) */}
      {isUserProfileOpen && !chat.isGroup && (() => {
        const remote = chatMembers.find(m => m.id !== user?.id)
        const displayName = currentChat.title
        const avatarUrl = currentChat.avatarUrl
        const initials = getInitials(displayName)
        const isMuted = !!mutedChats[chat.id]
        return (
          <div className="fixed inset-0 z-50 bg-white dark:bg-[#111112] flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06] flex-shrink-0">
              <button
                onClick={() => setIsUserProfileOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-xl text-black/50 dark:text-white/50 hover:bg-black/[0.05] dark:hover:bg-white/[0.07] transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h2 className="font-semibold text-[17px] text-black dark:text-white flex-1">Профиль</h2>
            </div>

            <div className="flex flex-col items-center gap-5 px-4 py-8">
              {/* Avatar */}
              <Avatar className="h-24 w-24">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />}
                <AvatarFallback className="bg-[#5d6cf5] text-white text-2xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>

              <div className="text-center">
                <h3 className="text-xl font-semibold text-black dark:text-white">{displayName}</h3>
                {remote?.id && (
                  <p className="text-sm text-black/40 dark:text-white/40 mt-0.5">Участник</p>
                )}
              </div>

              {/* Mute toggle */}
              <div className="w-full flex items-center justify-between bg-black/[0.05] dark:bg-white/[0.07] rounded-xl px-4 h-14">
                <div className="flex items-center gap-3">
                  {isMuted
                    ? <BellOff className="h-5 w-5 text-black/50 dark:text-white/50" />
                    : <Bell className="h-5 w-5 text-black/50 dark:text-white/50" />
                  }
                  <div>
                    <p className="text-[15px] font-medium text-black dark:text-white">Уведомления</p>
                    <p className="text-xs text-black/40 dark:text-white/40">{isMuted ? 'Отключены' : 'Включены'}</p>
                  </div>
                </div>
                <button
                  onClick={() => toggleMuteChat(chat.id)}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
                    !isMuted ? 'bg-[#5d6cf5]' : 'bg-black/[0.15] dark:bg-white/[0.15]'
                  )}
                >
                  <span className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                    !isMuted ? 'translate-x-6' : 'translate-x-1'
                  )} />
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Floating context menu */}
      {contextMenu && (() => {
        const m = contextMenu.msg
        const menuIsOwn = m.senderId === user?.id
        const isText = !(m as any).type || (m as any).type === 'TEXT'
        const menuW = 196
        const itemCount = 2 + (isText ? 1 : 0) + (menuIsOwn && isText ? 1 : 0) + 1 // +1 delete
        const menuH = itemCount * 44 + 24
        const vw = typeof window !== 'undefined' ? window.innerWidth : 400
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800
        const rx = Math.min(contextMenu.x, vw - menuW - 8)
        const flipped = contextMenu.y + menuH > vh - 8
        const ry = flipped ? Math.max(contextMenu.y - menuH, 8) : contextMenu.y
        const origin = flipped ? 'origin-bottom-left' : 'origin-top-left'
        return (
          <div
            className="fixed inset-0 z-50"
            onClick={() => setContextMenu(null)}
            onContextMenu={e => e.preventDefault()}
          >
            <div
              className={cn(
                'absolute bg-white dark:bg-[#1c1c1e] rounded-2xl border border-black/[0.06] dark:border-white/[0.08] py-1.5 overflow-hidden',
                'shadow-[0_8px_32px_rgba(0,0,0,0.18)]',
                'animate-in zoom-in-95 fade-in duration-100',
                origin
              )}
              style={{ left: rx, top: ry, minWidth: menuW }}
              onClick={e => e.stopPropagation()}
            >
              <button
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:bg-black/[0.06] dark:active:bg-white/[0.08] transition-colors text-left"
                onClick={() => { handleStartReply(m); setContextMenu(null) }}
              >
                <Reply className="h-4 w-4 text-black/40 dark:text-white/40 flex-shrink-0" />
                <span className="text-black dark:text-white text-sm">Ответить</span>
              </button>
              <button
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:bg-black/[0.06] dark:active:bg-white/[0.08] transition-colors text-left"
                onClick={() => { setForwardMessage(m); setIsForwardOpen(true); setContextMenu(null) }}
              >
                <Forward className="h-4 w-4 text-black/40 dark:text-white/40 flex-shrink-0" />
                <span className="text-black dark:text-white text-sm">Переслать</span>
              </button>
              {isText && (
                <button
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:bg-black/[0.06] dark:active:bg-white/[0.08] transition-colors text-left"
                  onClick={() => {
                    const txt = contextMenu?.msg.content
                    if (txt) navigator.clipboard?.writeText(txt)
                    setContextMenu(null)
                  }}
                >
                  <Copy className="h-4 w-4 text-black/40 dark:text-white/40 flex-shrink-0" />
                  <span className="text-black dark:text-white text-sm">Копировать</span>
                </button>
              )}
              {menuIsOwn && isText && (
                <button
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:bg-black/[0.06] dark:active:bg-white/[0.08] transition-colors text-left"
                  onClick={() => { handleStartEdit(m); setContextMenu(null) }}
                >
                  <Pencil className="h-4 w-4 text-black/40 dark:text-white/40 flex-shrink-0" />
                  <span className="text-black dark:text-white text-sm">Изменить</span>
                </button>
              )}
              <div className="my-1 h-px bg-black/[0.06] dark:bg-white/[0.08]" />
              <button
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 active:bg-red-100 transition-colors text-left"
                onClick={() => { handleDeleteMessage(m.id); setContextMenu(null) }}
              >
                <Trash2 className="h-4 w-4 text-red-400 flex-shrink-0" />
                <span className="text-red-400 text-sm">Удалить</span>
              </button>
            </div>
          </div>
        )
      })()}

      {/* Active call window */}
      {activeCall && (
        <CallWindow
          chatId={chat.id}
          remoteUserId={activeCall.remoteUserId}
          remoteUsername={activeCall.remoteUsername}
          role={activeCall.role}
          withVideo={activeCall.withVideo}
          incomingOffer={activeCall.incomingOffer}
          onClose={() => setActiveCall(null)}
        />
      )}
      <StoryViewer
        open={!!activeStoryUserId}
        userId={activeStoryUserId}
        onOpenChange={open => {
          if (!open) {
            setActiveStoryUserId(null)
            if (peerUserId) {
              storiesAPI.getFeed().then(result => {
                const entry = (result.users ?? []).find(item => item.user.id === peerUserId) ?? null
                setStoryInfo(entry)
              })
            }
          }
        }}
      />
    </div>
  )
}
