'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { AuthForm } from '@/components/messenger/AuthForm'
import { ChatList, type Tab } from '@/components/messenger/ChatList'
import { ChatWindow } from '@/components/messenger/ChatWindow'
import { GameChatWindow } from '@/components/messenger/GameChatWindow'
import { AdminBotWindow } from '@/components/messenger/AdminBotWindow'
import { CallWindow, IncomingCallDialog } from '@/components/messenger/CallWindow'
import { Button } from '@/components/ui/button'
import { useMessengerStore } from '@/lib/store'
import { messengerSocket } from '@/lib/socket'
import { authAPI, chatsAPI, getAuthToken, setAuthToken, type Chat, type Message } from '@/lib/api'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { LogOut, MessageCircle, MessageSquare, Search, UserRound, Film, Gamepad2, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ActivityNotification {
  id: string
  title: string
  message: string
  createdAt: string
  isRead: boolean
  type: 'message' | 'call' | 'clipme' | 'story' | 'generic'
  chatId?: string
  videoId?: string
  storyUserId?: string
}
const MAX_ACTIVITY_NOTIFICATIONS = 200

export default function MessengerPage() {
  const {
    user, isAuthenticated, activeChat, activeChatId, messages,
    setUser, setToken, setAuthenticated, logout, setActiveChat,
    setMessages, setChats, addChat, addMessage, deleteMessage, updateMessage,
    incrementUnread, clearUnread, updateChat, darkMode, unreadCounts, notificationsEnabled,
    activeVoiceInfo,
  } = useMessengerStore()

  const [isConnected, setIsConnected] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [chatListTab, setChatListTab] = useState<Tab>('chats')
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [initialClipVideoId, setInitialClipVideoId] = useState<string | null>(null)
  const [playmeOverlayPos, setPlaymeOverlayPos] = useState({ x: 12, y: 12 })
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null)
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false)
  const [activityNotifications, setActivityNotifications] = useState<ActivityNotification[]>([])
  const notificationsCount = activityNotifications.filter(n => !n.isRead).length
  // Incoming call state
  const [incomingCall, setIncomingCall] = useState<{
    chatId: string; callerId: string; callerName: string
    offer: RTCSessionDescriptionInit; withVideo: boolean
  } | null>(null)
  const [activeCallFromIncoming, setActiveCallFromIncoming] = useState<{
    chatId: string; remoteUserId: string; remoteUsername: string
    withVideo: boolean; incomingOffer: RTCSessionDescriptionInit
  } | null>(null)

  usePushNotifications(isAuthenticated, notificationsEnabled)

  const addActivityNotification = useCallback((
    title: string,
    message: string,
    meta?: { type?: ActivityNotification['type']; chatId?: string; videoId?: string; storyUserId?: string }
  ) => {
    const item: ActivityNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      message,
      createdAt: new Date().toISOString(),
      isRead: false,
      type: meta?.type ?? 'generic',
      chatId: meta?.chatId,
      videoId: meta?.videoId,
      storyUserId: meta?.storyUserId,
    }
    setActivityNotifications(prev => [item, ...prev].slice(0, MAX_ACTIVITY_NOTIFICATIONS))
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const deepLinkClip = params.get('clip')
    const deepLinkTab = params.get('tab')
    if (deepLinkClip) setInitialClipVideoId(deepLinkClip)
    if (deepLinkTab === 'clipme' || deepLinkClip) setChatListTab('clipme')
  }, [])

  useEffect(() => {
    const initApp = async () => {
      try {
        const storedToken = getAuthToken()
        if (storedToken) {
          setToken(storedToken)
          const result = await authAPI.me()
          if (result.user) {
            setUser(result.user)
            setAuthenticated(true)
            // Load chats in parallel — don't block on it
            chatsAPI.getAll().then(r => { if (r.chats) setChats(r.chats) })
          } else if (result.status === 401) {
            // Only clear session on explicit auth failure, not on server/network errors
            logout()
            setAuthToken(null)
          }
        }
      } finally {
        // Always unblock the UI — even on network errors
        setIsInitializing(false)
      }
    }
    initApp()
  }, [setUser, setToken, setAuthenticated, setChats])

  useEffect(() => {
    if (!isAuthenticated || !user) return
    const connectSocket = async () => {
      const connected = await messengerSocket.connect()
      setIsConnected(connected)
      if (connected) messengerSocket.authenticate(user)
    }
    connectSocket()
  }, [isAuthenticated, user])

  // Join all chat rooms when socket connects so messages arrive even if chat isn't open
  useEffect(() => {
    if (!isConnected || !user) return
    const { chats } = useMessengerStore.getState()
    chats.forEach(chat => messengerSocket.joinChat(chat.id, user.id))
  }, [isConnected, user])

  // Handle incoming calls globally
  useEffect(() => {
    if (!isAuthenticated) return

    const handleIncoming = (data: { chatId: string; callerId: string; callerName: string; offer: RTCSessionDescriptionInit; withVideo: boolean }) => {
      setIncomingCall(data)
      addActivityNotification('Звонок', `${data.callerName} звонит вам`, { type: 'call' })
    }

    // Caller cancelled before callee answered — dismiss the incoming call dialog
    const handleCallEnded = (data: { chatId: string }) => {
      setIncomingCall(prev => prev?.chatId === data.chatId ? null : prev)
    }

    messengerSocket.on('call-incoming', handleIncoming)
    messengerSocket.on('call-ended', handleCallEnded)
    return () => {
      messengerSocket.off('call-incoming', handleIncoming)
      messengerSocket.off('call-ended', handleCallEnded)
    }
  }, [isAuthenticated, addActivityNotification])

  useEffect(() => {
    if (!isAuthenticated || !user) return

    const getMessagePreview = (msg: Message) => {
      if (msg.type === 'AUDIO') return '🎤 Голосовое сообщение'
      if (msg.type === 'IMAGE') return '🖼️ Фото'
      if (msg.type === 'FILE') return `📎 ${msg.fileName ?? 'Файл'}`
      if (msg.type === 'VIDEO_NOTE') return '🎥 Видеосообщение'
      return msg.content || 'Новое сообщение'
    }

    const handleNewChat = (data: { chat: Chat }) => {
      const chat = { ...data.chat }
      if (!chat.isGroup) {
        const other = chat.members.find(m => m.id !== user.id)
        if (other) chat.title = other.username
      }
      addChat(chat)
      // Join the new chat room immediately so we receive its messages
      messengerSocket.joinChat(chat.id, user.id)
    }

    const handleNewMessage = (msg: import('@/lib/api').Message) => {
      const { activeChatId: currentChatId, user: currentUser, notificationsEnabled, mutedChats, chats: allChats } = useMessengerStore.getState()
      addMessage(msg.chatId, msg)
      if (msg.senderId !== currentUser?.id && msg.chatId !== currentChatId) {
        incrementUnread(msg.chatId)
        if (notificationsEnabled && !mutedChats[msg.chatId]) {
          const chat = allChats.find(c => c.id === msg.chatId)
          const title = chat ? `Messme · ${chat.title}` : 'Messme'
          const body = getMessagePreview(msg)
          addActivityNotification(title, body, { type: 'message', chatId: msg.chatId })
          if (typeof window !== 'undefined' && window.messmeDesktop?.notify) {
            window.messmeDesktop.notify({ title, body })
          }
        }
      }
    }

    const handleMessageDeleted = (data: { chatId: string; messageId: string }) => {
      deleteMessage(data.chatId, data.messageId)
    }

    const handleMessageEdited = (msg: import('@/lib/api').Message) => {
      updateMessage(msg.chatId, msg.id, msg.content, msg.isEdited ?? true)
    }

    messengerSocket.on('new-chat', handleNewChat)
    messengerSocket.on('new-message', handleNewMessage)
    messengerSocket.on('message-deleted', handleMessageDeleted)
    messengerSocket.on('message-edited', handleMessageEdited)
    return () => {
      messengerSocket.off('new-chat', handleNewChat)
      messengerSocket.off('new-message', handleNewMessage)
      messengerSocket.off('message-deleted', handleMessageDeleted)
      messengerSocket.off('message-edited', handleMessageEdited)
    }
  }, [isAuthenticated, user, addChat, addMessage, deleteMessage, updateMessage, incrementUnread, addActivityNotification])

  useEffect(() => {
    const handler = (event: Event) => {
      const payload = (event as CustomEvent<{ title?: string; message?: string; type?: ActivityNotification['type']; chatId?: string; videoId?: string; storyUserId?: string }>).detail
      if (!payload) return
      addActivityNotification(
        payload.title ?? 'Уведомление',
        payload.message ?? '',
        { type: payload.type, chatId: payload.chatId, videoId: payload.videoId, storyUserId: payload.storyUserId }
      )
    }
    window.addEventListener('messme:notify', handler as EventListener)
    return () => window.removeEventListener('messme:notify', handler as EventListener)
  }, [addActivityNotification])

  const handleSelectChat = useCallback(async (chat: Chat) => {
    if (chat.id === 'adminbot') {
      setActiveChat(chat)
      return
    }
    setActiveChat(chat)
    clearUnread(chat.id)
    const result = await chatsAPI.getById(chat.id)
    if (result.chat) {
      setMessages(chat.id, result.chat.messages)
      updateChat(chat.id, { hasMore: result.chat.hasMore ?? (result.chat.messages.length >= 100) })
    }
    if (user) messengerSocket.joinChat(chat.id, user.id)
  }, [user, setActiveChat, setMessages, clearUnread, updateChat])

  const handleBack = useCallback(() => {
    if (activeChatId && activeChatId !== 'adminbot' && user && !activeChat?.gameMode) messengerSocket.leaveChat(activeChatId, user.id)
    setActiveChat(null)
  }, [activeChatId, activeChat?.gameMode, user, setActiveChat])

  const handleMobileTabChange = useCallback((tab: Tab) => {
    setChatListTab(tab)
    if (activeChat) {
      if (activeChatId && activeChatId !== 'adminbot' && user && !activeChat.gameMode) messengerSocket.leaveChat(activeChatId, user.id)
      setActiveChat(null)
    }
  }, [activeChat, activeChatId, user, setActiveChat])

  const handleLogout = () => {
    messengerSocket.disconnect()
    setAuthToken(null)
    logout()
  }

  const handleAuthSuccess = async () => {
    setAuthenticated(true)
    const result = await chatsAPI.getAll()
    if (result.chats) setChats(result.chats)
  }

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#111112]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#5D6CF5] flex items-center justify-center animate-pulse">
            <MessageCircle className="h-6 w-6 text-white" />
          </div>
          <p className="text-black/30 dark:text-white/30 text-sm">Загрузка...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <AuthForm onSuccess={handleAuthSuccess} />
  }

  const currentMessages = activeChatId ? messages.get(activeChatId) || [] : []

  return (
    <div className="h-dvh flex overflow-hidden bg-white dark:bg-[#111112]">
      {/* Sidebar */}
      <div className={cn(
        'flex-shrink-0 flex flex-col w-full md:w-[340px] md:min-w-[280px] md:max-w-[520px] md:[resize:horizontal] md:overflow-x-auto',
        'bg-white dark:bg-[#111112] border-r border-black/[0.06] dark:border-white/[0.08]',
        activeChat?.gameMode
          ? 'hidden'
          : activeChat
            ? 'hidden md:flex'
            : 'flex'
      )}>
        {/* Sidebar header */}
        {chatListTab !== 'clipme' && (
          <div className="flex items-center justify-between px-4 min-h-16 border-b border-black/[0.06] dark:border-white/[0.08] flex-shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#5D6CF5] flex items-center justify-center">
                <MessageCircle className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold text-black dark:text-white">Messme</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="relative h-8 w-8 rounded-lg text-black/50 dark:text-white/70 hover:text-black/90 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] flex items-center justify-center transition-colors"
                onClick={() => {
                  setNotificationCenterOpen(v => {
                    if (!v) {
                      // Mark all as read when opening
                      setActivityNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
                    }
                    return !v
                  })
                }}
                title="Уведомления"
              >
                <Bell className="h-4 w-4" />
                {notificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#5d6cf5] px-1 text-[9px] font-bold text-white leading-none">
                    {notificationsCount > 99 ? '99+' : notificationsCount}
                  </span>
                )}
              </button>
              <Button
                variant="ghost" size="icon"
                onClick={() => setShowLogoutConfirm(true)}
                className="h-8 w-8 text-black/40 dark:text-white/40 hover:text-black/80 dark:hover:text-white/80 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] rounded-lg"
                title="Выйти"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Chat list */}
        <ChatList onSelectChat={handleSelectChat} activeChatId={activeChatId} onLogout={handleLogout}
          activeTab={chatListTab} onTabChange={setChatListTab} initialClipVideoId={initialClipVideoId} />
      </div>

      {/* Main chat area */}
      <div className={cn(
        'flex-1 flex flex-col min-w-0 overflow-hidden',
        activeChat ? 'flex' : 'hidden md:flex'
      )}>
        {activeChat ? (
          <>
            {activeChat.gameMode ? (
              <GameChatWindow
                key={activeChat.id}
                chat={activeChat}
                onBack={handleBack}
              />
            ) : activeChat.id === 'adminbot' ? (
              <AdminBotWindow
                key={activeChat.id}
                onBack={handleBack}
                isMobile={true}
              />
            ) : (
              <ChatWindow
                key={activeChat.id}
                chat={activeChat}
                messages={currentMessages}
                onBack={handleBack}
                isMobile={true}
              />
            )}
          </>
        ) : (
          <div className="flex-1 hidden md:flex" />
        )}
      </div>

      {/* Incoming call notification */}
      {incomingCall && !activeCallFromIncoming && (
        <IncomingCallDialog
          callerName={incomingCall.callerName}
          withVideo={incomingCall.withVideo}
          onAccept={() => {
            setActiveCallFromIncoming({
              chatId: incomingCall.chatId,
              remoteUserId: incomingCall.callerId,
              remoteUsername: incomingCall.callerName,
              withVideo: incomingCall.withVideo,
              incomingOffer: incomingCall.offer,
            })
            setIncomingCall(null)
          }}
          onReject={() => {
            messengerSocket.sendCallReject(incomingCall.chatId, incomingCall.callerId)
            setIncomingCall(null)
          }}
        />
      )}

      {/* Global notification center */}
      {isAuthenticated && (
        <>
          {notificationCenterOpen && (
            <>
              {/* Backdrop — closes panel on any click */}
              <div
                className="fixed inset-0 z-30"
                onClick={() => setNotificationCenterOpen(false)}
              />
              <div className="fixed right-4 top-[72px] z-40 w-[min(360px,calc(100vw-2rem))] max-h-[60vh] overflow-hidden rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-white/95 dark:bg-[#1a1a1d]/95 backdrop-blur shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200">
                <div className="h-11 px-3 flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08]">
                  <p className="text-sm font-semibold text-black dark:text-white">Уведомления</p>
                  <button
                    className="text-xs text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"
                    onClick={() => setActivityNotifications([])}
                  >
                    Очистить
                  </button>
                </div>
                <div className="max-h-[calc(60vh-44px)] overflow-y-auto">
                  {activityNotifications.length === 0 ? (
                    <p className="p-4 text-sm text-black/45 dark:text-white/45">Пока уведомлений нет</p>
                  ) : (
                    activityNotifications.map(item => {
                      const isNavigable = item.type === 'message' || item.type === 'clipme' || item.type === 'story'
                      const handleClick = () => {
                        setNotificationCenterOpen(false)
                        if (item.type === 'message' && item.chatId) {
                          const chat = useMessengerStore.getState().chats.find(c => c.id === item.chatId)
                          if (chat) handleSelectChat(chat)
                        } else if (item.type === 'clipme' && item.videoId) {
                          setInitialClipVideoId(item.videoId)
                          setChatListTab('clipme')
                          if (activeChat) setActiveChat(null)
                        } else if (item.type === 'story') {
                          setChatListTab('chats')
                          if (activeChat) setActiveChat(null)
                        }
                      }
                      return (
                        <div
                          key={item.id}
                          onClick={isNavigable ? handleClick : undefined}
                          className={cn(
                            'px-3 py-2.5 border-b border-black/[0.04] dark:border-white/[0.06] transition-colors',
                            !item.isRead && 'bg-[#5d6cf5]/[0.04] dark:bg-[#5d6cf5]/[0.07]',
                            isNavigable && 'cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                          )}
                        >
                          <div className="flex items-start gap-2">
                            {!item.isRead && <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#5d6cf5]" />}
                            <div className={cn('min-w-0', !item.isRead && 'pl-0', item.isRead && 'pl-3.5')}>
                              <p className="text-xs font-semibold text-black/85 dark:text-white/90 truncate">{item.title}</p>
                              <p className="text-sm text-black/70 dark:text-white/75">{item.message}</p>
                              <p className="text-[11px] text-black/35 dark:text-white/35 mt-1">{new Date(item.createdAt).toLocaleString('ru-RU')}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Active call (from incoming) */}
      {activeCallFromIncoming && (
        <CallWindow
          chatId={activeCallFromIncoming.chatId}
          remoteUserId={activeCallFromIncoming.remoteUserId}
          remoteUsername={activeCallFromIncoming.remoteUsername}
          role="callee"
          withVideo={activeCallFromIncoming.withVideo}
          incomingOffer={activeCallFromIncoming.incomingOffer}
          onClose={() => setActiveCallFromIncoming(null)}
        />
      )}

      {/* Mobile bottom nav — hidden when a chat is open */}
      {isAuthenticated && !isInitializing && !activeChat && chatListTab !== 'clipme' && (() => {
        const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)
        return (
          <div
            className="md:hidden fixed bottom-0 left-0 right-0 z-20 px-3 pt-2"
            style={{
              paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
              background: darkMode ? 'rgba(17,17,18,0.92)' : 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(20px)',
              boxShadow: darkMode ? '0px -1px 0px 0px rgba(255,255,255,0.06)' : '0px -1px 0px 0px rgba(0,0,0,0.06)',
            }}
          >
            <div className="flex items-center justify-around bg-black/[0.05] dark:bg-white/[0.08] rounded-2xl px-1 py-2">
              {/* Chats */}
              <button onClick={() => handleMobileTabChange('chats')} className="flex flex-col items-center gap-1 flex-1">
                <div
                  className={cn('relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200',
                    chatListTab === 'chats' ? 'bg-white/80 dark:bg-white/[0.15]' : '')}
                  style={chatListTab === 'chats' ? { boxShadow: '0px 6px 20px 0px rgba(21,44,255,0.25)' } : undefined}
                >
                  <MessageSquare className={cn('h-5 w-5', chatListTab === 'chats' ? 'text-black dark:text-white' : 'text-black/60 dark:text-white/60')} />
                  {totalUnread > 0 && chatListTab !== 'chats' && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#5d6cf5] px-1 text-[10px] font-bold text-white leading-none">
                      {totalUnread > 99 ? '99+' : totalUnread}
                    </span>
                  )}
                </div>
                <span className={cn('text-[11px] font-bold', chatListTab === 'chats' ? 'text-black dark:text-white' : 'text-black/60 dark:text-white/60')}>Чаты</span>
              </button>
              {/* Search */}
              <button onClick={() => handleMobileTabChange('search')} className="flex flex-col items-center gap-1 flex-1">
                <div
                  className={cn('w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200',
                    chatListTab === 'search' ? 'bg-white/80 dark:bg-white/[0.15]' : '')}
                  style={chatListTab === 'search' ? { boxShadow: '0px 6px 20px 0px rgba(21,44,255,0.25)' } : undefined}
                >
                  <Search className={cn('h-5 w-5', chatListTab === 'search' ? 'text-black dark:text-white' : 'text-black/60 dark:text-white/60')} />
                </div>
                <span className={cn('text-[11px] font-bold', chatListTab === 'search' ? 'text-black dark:text-white' : 'text-black/60 dark:text-white/60')}>Поиск</span>
              </button>
              {/* Profile */}
              <button onClick={() => handleMobileTabChange('profile')} className="flex flex-col items-center gap-1 flex-1">
                <div className={cn('w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200',
                  chatListTab === 'profile' ? 'bg-white/80 dark:bg-white/[0.15]' : '')}
                  style={chatListTab === 'profile' ? { boxShadow: '0px 6px 20px 0px rgba(21,44,255,0.25)' } : undefined}
                >
                  <UserRound className={cn('h-5 w-5', chatListTab === 'profile' ? 'text-black dark:text-white' : 'text-black/60 dark:text-white/60')} />
                </div>
                <span className={cn('text-[11px] font-bold', chatListTab === 'profile' ? 'text-black dark:text-white' : 'text-black/60 dark:text-white/60')}>Профиль</span>
              </button>
              {/* ClipMe */}
              <button onClick={() => handleMobileTabChange('clipme')} className="flex flex-col items-center gap-1 flex-1">
                <div className={cn('w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200',
                  chatListTab === 'clipme' ? 'bg-white/80 dark:bg-white/[0.15]' : '')}
                  style={chatListTab === 'clipme' ? { boxShadow: '0px 6px 20px 0px rgba(21,44,255,0.25)' } : undefined}
                >
                  <Film className={cn('h-5 w-5', chatListTab === 'clipme' ? 'text-black dark:text-white' : 'text-black/60 dark:text-white/60')} />
                </div>
                <span className={cn('text-[11px] font-bold', chatListTab === 'clipme' ? 'text-black dark:text-white' : 'text-black/60 dark:text-white/60')}>ClipMe</span>
              </button>
            </div>
          </div>
        )
      })()}

      {/* PlayMe voice badge — only when actually in a voice channel and not viewing PlayMe */}
      {activeVoiceInfo && !activeChat?.gameMode && (
        <button
          className="fixed z-30 rounded-2xl bg-black/70 dark:bg-black/80 backdrop-blur-md text-white px-3 py-2 shadow-2xl flex items-center gap-2.5 select-none border border-white/10"
          style={{ left: playmeOverlayPos.x, bottom: playmeOverlayPos.y }}
          onClick={() => {
            const chat = useMessengerStore.getState().chats.find(c => c.id === activeVoiceInfo.chatId)
            if (chat) handleSelectChat(chat)
          }}
          onMouseDown={e => {
            dragOffsetRef.current = { dx: e.clientX - playmeOverlayPos.x, dy: e.clientY - (window.innerHeight - playmeOverlayPos.y) }
            const move = (ev: MouseEvent) => {
              if (!dragOffsetRef.current) return
              const nextX = Math.max(8, Math.min(window.innerWidth - 220, ev.clientX - dragOffsetRef.current.dx))
              const bottomY = Math.max(8, Math.min(window.innerHeight - 72, window.innerHeight - (ev.clientY - dragOffsetRef.current.dy)))
              setPlaymeOverlayPos({ x: nextX, y: bottomY })
            }
            const up = () => {
              dragOffsetRef.current = null
              window.removeEventListener('mousemove', move)
              window.removeEventListener('mouseup', up)
            }
            window.addEventListener('mousemove', move)
            window.addEventListener('mouseup', up)
          }}
          title="Вернуться в Playme"
        >
          {/* Pulsing green dot */}
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400" />
          </span>
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={user?.avatarUrl ?? undefined} />
            <AvatarFallback className="text-[10px] bg-[#5d6cf5] text-white">
              {(user?.username ?? '?')[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col items-start leading-none min-w-0">
            <span className="text-[11px] font-semibold text-white truncate max-w-[120px]">{user?.username}</span>
            <span className="text-[10px] text-white/60 truncate max-w-[120px]">
              <Gamepad2 className="inline h-2.5 w-2.5 mr-0.5 -mt-px" />{activeVoiceInfo.channelName}
            </span>
          </div>
        </button>
      )}

      {/* Logout confirmation */}
      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent className="bg-white dark:bg-[#1c1c1e] border-black/[0.08] dark:border-white/[0.08] max-w-xs">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-black dark:text-white">Выйти из аккаунта?</AlertDialogTitle>
            <AlertDialogDescription className="text-black/50 dark:text-white/50">
              Вы уверены, что хотите выйти?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-black/[0.08] dark:border-white/[0.08] text-black dark:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08]">
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-600 text-white border-0"
            >
              Выйти
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
