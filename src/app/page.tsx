'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { AuthForm } from '@/components/messenger/AuthForm'
import { ChatList, type Tab } from '@/components/messenger/ChatList'
import { ChatWindow } from '@/components/messenger/ChatWindow'
import { GameChatWindow } from '@/components/messenger/GameChatWindow'
import { CallWindow, IncomingCallDialog } from '@/components/messenger/CallWindow'
import { Button } from '@/components/ui/button'
import { useMessengerStore } from '@/lib/store'
import { messengerSocket } from '@/lib/socket'
import { authAPI, chatsAPI, getAuthToken, setAuthToken, type Chat, type Message } from '@/lib/api'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { LogOut, MessageCircle, Wifi, WifiOff, MessageSquare, Search, UserRound, Film, Gamepad2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function MessengerPage() {
  const {
    user, isAuthenticated, activeChat, activeChatId, messages,
    setUser, setToken, setAuthenticated, logout, setActiveChat,
    setMessages, setChats, addChat, addMessage, deleteMessage, updateMessage,
    incrementUnread, clearUnread, updateChat, darkMode, unreadCounts
  } = useMessengerStore()

  const [isConnected, setIsConnected] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [chatListTab, setChatListTab] = useState<Tab>('chats')
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [initialClipVideoId, setInitialClipVideoId] = useState<string | null>(null)
  const [lastPlaymeChat, setLastPlaymeChat] = useState<Chat | null>(null)
  const [returnedFromPlayme, setReturnedFromPlayme] = useState(false)
  const [playmeOverlayPos, setPlaymeOverlayPos] = useState({ x: 12, y: 12 })
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null)
  // Incoming call state
  const [incomingCall, setIncomingCall] = useState<{
    chatId: string; callerId: string; callerName: string
    offer: RTCSessionDescriptionInit; withVideo: boolean
  } | null>(null)
  const [activeCallFromIncoming, setActiveCallFromIncoming] = useState<{
    chatId: string; remoteUserId: string; remoteUsername: string
    withVideo: boolean; incomingOffer: RTCSessionDescriptionInit
  } | null>(null)

  usePushNotifications(isAuthenticated)

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
  }, [isAuthenticated])

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
        if (notificationsEnabled && !mutedChats[msg.chatId]) {
          incrementUnread(msg.chatId)
          const chat = allChats.find(c => c.id === msg.chatId)
          const title = chat ? `Messme · ${chat.title}` : 'Messme'
          const body = getMessagePreview(msg)
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
  }, [isAuthenticated, user, addChat, addMessage, deleteMessage, updateMessage, incrementUnread])

  const handleSelectChat = useCallback(async (chat: Chat) => {
    if (chat.gameMode) {
      setLastPlaymeChat(chat)
      setReturnedFromPlayme(false)
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
    if (activeChat?.gameMode) setReturnedFromPlayme(true)
    else setReturnedFromPlayme(false)
    if (activeChatId && user && !activeChat?.gameMode) messengerSocket.leaveChat(activeChatId, user.id)
    setActiveChat(null)
  }, [activeChatId, activeChat?.gameMode, user, setActiveChat])

  const handleMobileTabChange = useCallback((tab: Tab) => {
    setChatListTab(tab)
    if (activeChat) {
      if (activeChatId && user && !activeChat.gameMode) messengerSocket.leaveChat(activeChatId, user.id)
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
        'flex-shrink-0 flex flex-col w-full md:w-80 lg:w-[340px]',
        'bg-white dark:bg-[#111112] border-r border-black/[0.06] dark:border-white/[0.08]',
        activeChat?.gameMode
          ? 'hidden'
          : activeChat
            ? 'hidden md:flex'
            : 'flex'
      )}>
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 min-h-16 border-b border-black/[0.06] dark:border-white/[0.08] flex-shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#5D6CF5] flex items-center justify-center">
              <MessageCircle className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-black dark:text-white">Messme</span>
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Wifi className="h-4 w-4 text-[#0ed221]" title="Подключено" />
            ) : (
              <WifiOff className="h-4 w-4 text-black/20 dark:text-white/20" title="Отключено" />
            )}
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
      {isAuthenticated && !isInitializing && !activeChat && (() => {
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

      {lastPlaymeChat && returnedFromPlayme && activeChat && !activeChat.gameMode && activeChat.isGroup && (
        <button
          className="fixed z-30 rounded-xl bg-[#5d6cf5] hover:bg-[#4a5be0] text-white px-3 py-2 shadow-xl flex items-center gap-2 select-none"
          style={{ left: playmeOverlayPos.x, bottom: playmeOverlayPos.y }}
          onClick={() => {
            setReturnedFromPlayme(false)
            setActiveChat(lastPlaymeChat)
          }}
          onMouseDown={e => {
            dragOffsetRef.current = { dx: e.clientX - playmeOverlayPos.x, dy: e.clientY - (window.innerHeight - playmeOverlayPos.y) }
            const move = (ev: MouseEvent) => {
              if (!dragOffsetRef.current) return
              const nextX = Math.max(8, Math.min(window.innerWidth - 180, ev.clientX - dragOffsetRef.current.dx))
              const bottomY = Math.max(8, Math.min(window.innerHeight - 56, window.innerHeight - (ev.clientY - dragOffsetRef.current.dy)))
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
          <Gamepad2 className="h-4 w-4" />
          <span className="text-xs font-semibold">Вернуться в Playme</span>
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
