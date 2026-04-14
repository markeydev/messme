'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { chatsAPI, usersAPI, profileAPI, storiesAPI, clipMeAPI, type Chat, type StoryFeedItem, type User } from '@/lib/api'
import { useMessengerStore } from '@/lib/store'
import { messengerSocket } from '@/lib/socket'
import { STORY_MAX_VIDEO_DURATION_SECONDS } from '@/lib/stories'
import { StoryViewer } from '@/components/messenger/StoryViewer'
import { ClipMeTab } from '@/components/messenger/ClipMeTab'
import { VerifiedBadge } from '@/components/messenger/VerifiedBadge'
import { Slider } from '@/components/ui/slider'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PenSquare, Search, MessageSquare, Users, Check, X, BellOff, UserRound, Camera, Bell, Loader2, LogOut, Sun, Moon, Gamepad2, Trash2, Plus, Mic, Volume2, VolumeX, Film, Headphones, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

const STORY_IMAGE_TARGET_BYTES = 380 * 1024
const STORY_IMAGE_MAX_DIMENSION = 1920

export type Tab = 'chats' | 'search' | 'profile' | 'clipme'

interface ChatListProps {
  onSelectChat?: (chat: Chat) => void
  activeChatId?: string | null
  onProfileClick?: () => void
  onLogout?: () => void
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  initialClipVideoId?: string | null
}

export function ChatList({ onSelectChat, activeChatId, onProfileClick, onLogout, activeTab, onTabChange, initialClipVideoId }: ChatListProps) {
  const {
    chats, addChat, user, unreadCounts, mutedChats, updateUser, notificationsEnabled, setNotificationsEnabled,
    darkMode, setDarkMode, removeChat, setActiveChat, microphoneVolume, outputVolume,
    audioInputDeviceId, audioOutputDeviceId, soundEffectsEnabled, autoPlayMedia,
    setMicrophoneVolume, setOutputVolume, setAudioInputDeviceId, setAudioOutputDeviceId, setSoundEffectsEnabled, setAutoPlayMedia
  } = useMessengerStore()
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([])
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([])
  const [chatSearchQuery, setChatSearchQuery] = useState('')
  const [chatGroupFilter, setChatGroupFilter] = useState<'MESSME' | 'PLAYME'>('MESSME')
  const [storyFeed, setStoryFeed] = useState<StoryFeedItem[]>([])
  const [isStoriesLoading, setIsStoriesLoading] = useState(false)
  const [activeStoryUserId, setActiveStoryUserId] = useState<string | null>(null)
  const [isUploadingStory, setIsUploadingStory] = useState(false)
  const storyFileInputRef = useRef<HTMLInputElement>(null)
  const storiesScrollRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGroupMode, setIsGroupMode] = useState(false)
  const [groupTitle, setGroupTitle] = useState('')

  // ── Chat context menu ─────────────────────────────────────────────────────
  const [chatMenu, setChatMenu] = useState<{ chat: Chat; x: number; y: number } | null>(null)
  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null)
  const [isDeletingChat, setIsDeletingChat] = useState(false)

  useEffect(() => {
    if (!chatMenu) return
    const close = () => setChatMenu(null)
    window.addEventListener('click', close)
    return () => { window.removeEventListener('click', close) }
  }, [chatMenu])

  const handleDeleteConversation = async () => {
    if (!chatToDelete) return
    setIsDeletingChat(true)
    await chatsAPI.deleteConversation(chatToDelete.id)
    removeChat(chatToDelete.id)
    setActiveChat(null)
    setIsDeletingChat(false)
    setChatToDelete(null)
  }
  const [isGameMode, setIsGameMode] = useState(false)
  const [isPersonalChannel, setIsPersonalChannel] = useState(false)

  // Last message preview text per chat — content is already decrypted server-side
  const getPreview = (chat: Chat): string => {
    const lm = chat.lastMessage
    if (!lm) return ''
    const type = (lm as any).type as string | undefined
    if (type === 'AUDIO') return '🎤 Голосовое'
    if (type === 'IMAGE') return '🖼️ Фото'
    if (type === 'FILE') return `📎 ${(lm as any).fileName ?? 'Файл'}`
    if (type === 'VIDEO_NOTE') return '🎥 Видеосообщение'
    return lm.content ?? ''
  }

  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<User[]>([])
  const [selectedUsers, setSelectedUsers] = useState<User[]>([])

  // Profile state
  const [profileUsername, setProfileUsername] = useState(user?.username ?? '')
  const [profileBio, setProfileBio] = useState(user?.bio ?? '')
  const [profileClipMeBio, setProfileClipMeBio] = useState(user?.clipMeBio ?? '')
  const [linkedMessmeChannelId, setLinkedMessmeChannelId] = useState(user?.linkedMessmeChannelId ?? '')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setProfileUsername(user?.username ?? '')
    setProfileBio(user?.bio ?? '')
    setProfileClipMeBio(user?.clipMeBio ?? '')
    setLinkedMessmeChannelId(user?.linkedMessmeChannelId ?? '')
  }, [user?.username, user?.bio, user?.clipMeBio, user?.linkedMessmeChannelId])

  useEffect(() => {
    const loadDevices = async () => {
      if (!navigator?.mediaDevices?.enumerateDevices) return
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        setAudioInputs(devices.filter(d => d.kind === 'audioinput'))
        setAudioOutputs(devices.filter(d => d.kind === 'audiooutput'))
      } catch {}
    }
    loadDevices()
    navigator.mediaDevices?.addEventListener?.('devicechange', loadDevices)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', loadDevices)
  }, [])

  const handleStoriesWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const container = storiesScrollRef.current
    if (!container) return
    if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return
    e.preventDefault()
    container.scrollBy({ left: e.deltaY, behavior: 'auto' })
  }, [])

  const filteredChats = chats.filter(chat =>
    chat.title.toLowerCase().includes(chatSearchQuery.toLowerCase()) &&
    (chatGroupFilter === 'PLAYME' ? !!chat.gameMode : !chat.gameMode)
  )
  const messmeChatsCount = chats.filter(chat => !chat.gameMode).length
  const playmeChatsCount = chats.filter(chat => !!chat.gameMode).length
  const ownedPersonalChannels = useMemo(
    () => chats.filter(chat => chat.isPersonalChannel && chat.ownerId === user?.id),
    [chats, user?.id]
  )
  const storiesByUser = new Map(storyFeed.map(item => [item.user.id, item]))
  const isAdminUser = Boolean(user?.isAdmin)
  const adminbotChat: Chat = {
    id: 'adminbot',
    title: 'adminbot',
    isGroup: false,
    members: [
      { id: 'adminbot', username: 'adminbot', avatarUrl: null, isBadgeVerified: true },
      ...(user ? [{ id: user.id, username: user.username, avatarUrl: user.avatarUrl ?? null, isBadgeVerified: user.isBadgeVerified }] : []),
    ],
    lastMessage: {
      id: 'adminbot-system',
      content: 'Сгенерируйте ссылку на админ-панель',
      createdAt: new Date().toISOString(),
      senderId: 'adminbot',
      type: 'TEXT',
      fileName: null,
    },
  }

  const refreshStories = async () => {
    setIsStoriesLoading(true)
    const result = await storiesAPI.getFeed()
    setStoryFeed(result.users ?? [])
    setIsStoriesLoading(false)
  }

  useEffect(() => {
    if (activeTab !== 'chats') return
    refreshStories()
  }, [activeTab, chats.length])

  const openStory = (storyUserId: string) => {
    setActiveStoryUserId(storyUserId)
  }

  const handleOpenChatWithViewer = async (viewer: { id: string; username: string; avatarUrl?: string | null }) => {
    const result = await chatsAPI.create([viewer.id], false)
    if (!result.chat) return
    addChat(result.chat)
    if (result.isNew && result.chat.memberIds) {
      messengerSocket.notifyChatCreated(result.chat, result.chat.memberIds)
    }
    onTabChange('chats')
    onSelectChat?.(result.chat)
  }

  const readVideoDuration = (file: File): Promise<number> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.src = url
      v.onloadedmetadata = () => {
        const duration = v.duration
        URL.revokeObjectURL(url)
        v.removeAttribute('src')
        v.load()
        v.remove()
        if (!Number.isFinite(duration) || duration <= 0) reject(new Error('Не удалось определить длительность видео'))
        else resolve(duration)
      }
      v.onerror = () => {
        URL.revokeObjectURL(url)
        v.removeAttribute('src')
        v.load()
        v.remove()
        reject(new Error('Ошибка чтения видео'))
      }
    })

  const readImage = (file: File): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Ошибка чтения изображения'))
      }
      img.src = url
    })

  const compressStoryImage = async (file: File): Promise<File> => {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
    const img = await readImage(file)
    const maxSide = Math.max(img.width, img.height)
    const scale = maxSide > STORY_IMAGE_MAX_DIMENSION ? STORY_IMAGE_MAX_DIMENSION / maxSide : 1
    const width = Math.max(1, Math.round(img.width * scale))
    const height = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, width, height)

    const tryBlob = (quality: number) => new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/jpeg', quality)
    })

    let low = 0.5
    let high = 0.92
    let bestBlob: Blob | null = null
    for (let i = 0; i < 6; i += 1) {
      const quality = (low + high) / 2
      const blob = await tryBlob(quality)
      if (!blob) continue
      if (blob.size <= STORY_IMAGE_TARGET_BYTES) {
        bestBlob = blob
        low = quality
      } else {
        high = quality
      }
    }

    const fallbackBlob = await tryBlob(0.78)
    const blob = bestBlob ?? fallbackBlob
    if (!blob) return file
    const outputName = file.name.includes('.') ? file.name.replace(/\.[^.]+$/, '.jpg') : `${file.name}.jpg`
    return new File([blob], outputName, { type: 'image/jpeg' })
  }

  const handleStoryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setProfileError(null)
    setIsUploadingStory(true)
    try {
      const isVideo = file.type.startsWith('video/')
      const storyFile = isVideo ? file : await compressStoryImage(file)
      const duration = isVideo ? await readVideoDuration(storyFile) : null
      if (isVideo && (duration ?? 0) > STORY_MAX_VIDEO_DURATION_SECONDS) {
        setProfileError(`Видео для сторис должно быть до ${STORY_MAX_VIDEO_DURATION_SECONDS} секунд`)
        setIsUploadingStory(false)
        return
      }
      const uploaded = await storiesAPI.uploadStoryMedia(storyFile, duration)
      if (uploaded.error || !uploaded.url || !uploaded.mediaType) {
        setProfileError(uploaded.error ?? 'Ошибка загрузки сторис')
        setIsUploadingStory(false)
        return
      }
      const created = await storiesAPI.createStory(uploaded.url, uploaded.mediaType, uploaded.duration)
      if (created.error) {
        setProfileError(created.error)
      } else if (created.story && user?.id) {
        setActiveStoryUserId(user.id)
      }
      await refreshStories()
    } catch {
      setProfileError('Ошибка загрузки сторис')
    } finally {
      setIsUploadingStory(false)
    }
  }

  const handleUserSearch = async (query: string) => {
    setUserSearchQuery(query)
    if (query.length >= 2) {
      const result = await usersAPI.search(query)
      if (result.users) setSearchResults(result.users.filter(u => u.id !== user?.id))
    } else {
      setSearchResults([])
    }
  }

  const toggleUserSelection = (u: User) => {
    setSelectedUsers(prev =>
      prev.some(x => x.id === u.id) ? prev.filter(x => x.id !== u.id) : [...prev, u]
    )
  }

  const handleCreateChat = async () => {
    if (selectedUsers.length === 0) return
    setIsLoading(true)
    const result = await chatsAPI.create(
      selectedUsers.map(u => u.id),
      isGroupMode,
      isGroupMode ? groupTitle : undefined,
      isGroupMode ? isGameMode : false,
      isGroupMode ? isPersonalChannel : false
    )
    if (result.chat) {
      addChat(result.chat)
      if (result.isNew && result.chat.memberIds) {
        messengerSocket.notifyChatCreated(result.chat, result.chat.memberIds)
      }
      resetSearch()
      onTabChange('chats')
      onSelectChat?.(result.chat)
    }
    setIsLoading(false)
  }

  const resetSearch = () => {
    setSelectedUsers([])
    setUserSearchQuery('')
    setSearchResults([])
    setGroupTitle('')
    setIsGroupMode(false)
    setIsGameMode(false)
    setIsPersonalChannel(false)
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  const clearAvatarPreview = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarPreview(null)
    setAvatarFile(null)
  }

  const handleProfileSave = async () => {
    if (!user) return
    setProfileError(null)
    setIsSaving(true)
    try {
      let newAvatarUrl: string | null | undefined = undefined
      if (avatarFile) {
        const uploaded = await profileAPI.uploadAvatar(avatarFile, 'user')
        if (uploaded.error || !uploaded.url) {
          setProfileError(uploaded.error ?? 'Ошибка загрузки аватара')
          setIsSaving(false)
          return
        }
        newAvatarUrl = uploaded.url
      }
      const trimmed = profileUsername.trim()
      const result = await profileAPI.updateProfile(
        trimmed || user.username,
        newAvatarUrl !== undefined ? newAvatarUrl : undefined,
        profileBio.trim(),
        linkedMessmeChannelId || null
      )
      if (result.error || !result.user) {
        setProfileError(result.error ?? 'Ошибка сохранения')
        return
      }
      const clipMeResult = await clipMeAPI.updateChannelBio(user.id, profileClipMeBio)
      if (!clipMeResult.error && clipMeResult.user) {
        result.user.clipMeBio = clipMeResult.user.clipMeBio ?? null
      }
      updateUser(result.user)
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
      setAvatarPreview(null)
      setAvatarFile(null)
    } catch {
      setProfileError('Ошибка соединения')
    } finally {
      setIsSaving(false)
    }
  }

  const formatTime = (dateStr?: string | null) => {
    if (!dateStr) return ''
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return ''
      const now = new Date()
      const diff = now.getTime() - date.getTime()
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      if (days === 0) return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      if (days === 1) return 'Вчера'
      if (days < 7) return date.toLocaleDateString('ru-RU', { weekday: 'short' })
      return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
    } catch { return '' }
  }

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-[#111112]">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-[22px] font-bold text-black dark:text-white tracking-[-0.5px]">
          {activeTab === 'chats' ? 'Чаты' : activeTab === 'search' ? 'Поиск' : activeTab === 'clipme' ? 'ClipMe' : 'Профиль'}
        </h1>
        {activeTab === 'chats' && (
          <button
            onClick={() => { resetSearch(); onTabChange('search') }}
            className="h-9 w-9 flex items-center justify-center rounded-full bg-black/[0.06] dark:bg-white/[0.08] text-black/50 dark:text-white/50 hover:bg-black/[0.10] dark:hover:bg-white/[0.12] transition-colors"
          >
            <PenSquare className="h-[17px] w-[17px]" />
          </button>
        )}
      </div>

      {/* Tab: Chats */}
      {activeTab === 'chats' && (
        <>
          {/* Search bar */}
          <div className="px-3 pb-2 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/30" />
              <Input
                placeholder="Поиск..."
                value={chatSearchQuery}
                onChange={e => setChatSearchQuery(e.target.value)}
                className="pl-9 h-9 bg-black/[0.05] dark:bg-white/[0.07] border-0 text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 focus-visible:ring-1 focus-visible:ring-[#152cff]/30 rounded-xl text-sm"
              />
            </div>
          </div>
          <div className="px-3 pb-2 flex-shrink-0">
            <div className="flex bg-black/[0.05] dark:bg-white/[0.07] rounded-xl p-1 gap-1">
              <button
                onClick={() => setChatGroupFilter('MESSME')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 h-8 rounded-lg text-xs font-semibold transition-all',
                  chatGroupFilter === 'MESSME'
                    ? 'bg-white dark:bg-white/[0.12] text-black dark:text-white shadow-sm'
                    : 'text-black/45 dark:text-white/45 hover:text-black/65 dark:hover:text-white/65'
                )}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Messme</span>
                <span className="text-[10px] opacity-70">{messmeChatsCount}</span>
              </button>
              <button
                onClick={() => setChatGroupFilter('PLAYME')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 h-8 rounded-lg text-xs font-semibold transition-all',
                  chatGroupFilter === 'PLAYME'
                    ? 'bg-white dark:bg-white/[0.12] text-black dark:text-white shadow-sm'
                    : 'text-black/45 dark:text-white/45 hover:text-black/65 dark:hover:text-white/65'
                )}
              >
                <Gamepad2 className="h-3.5 w-3.5" />
                <span>Playme</span>
                <span className="text-[10px] opacity-70">{playmeChatsCount}</span>
              </button>
            </div>
          </div>
          <div className="px-3 pb-2 flex-shrink-0">
            <div
              ref={storiesScrollRef}
              className="overflow-x-auto"
              onWheel={handleStoriesWheel}
            >
              <div className="flex items-center gap-2 min-w-max pr-1">
                {isStoriesLoading && storyFeed.length === 0 ? (
                  <span className="text-xs text-black/40 dark:text-white/40 px-1">Загрузка сторис...</span>
                ) : storyFeed.length === 0 ? (
                  <span className="text-xs text-black/35 dark:text-white/35 px-1">Нет активных сторис</span>
                ) : (
                  storyFeed.map(item => (
                    <button
                      key={item.user.id}
                      onClick={() => openStory(item.user.id)}
                      className="flex flex-col items-center gap-1.5 w-[62px] flex-shrink-0"
                      title={`Сторис: ${item.user.username}`}
                    >
                      <span className={cn(
                        'p-[2px] rounded-full',
                        item.hasUnseen ? 'bg-gradient-to-br from-[#ff4d67] via-[#f7b142] to-[#5d6cf5]' : 'bg-black/15 dark:bg-white/15'
                      )}>
                        <Avatar className="h-12 w-12 border-2 border-white dark:border-[#111112]">
                          {item.user.avatarUrl && <AvatarImage src={item.user.avatarUrl} alt={item.user.username} />}
                          <AvatarFallback className="bg-[#5d6cf5] text-white text-xs font-semibold">
                            {getInitials(item.user.username)}
                          </AvatarFallback>
                        </Avatar>
                      </span>
                      <span className="text-[10px] text-black/55 dark:text-white/55 truncate max-w-full">
                        {item.user.id === user?.id ? 'Вы' : item.user.username}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {filteredChats.length === 0 ? (
              /* Empty state */
              <div className="relative flex flex-col items-center justify-center py-12 px-4 min-h-[320px] overflow-hidden">
                {/* Decorative background text watermark */}
                <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center select-none pointer-events-none overflow-hidden">
                  <span className="text-[56px] font-black text-black/[0.04] dark:text-white/[0.04] leading-tight tracking-tight whitespace-nowrap">
                    {chatSearchQuery ? 'Не найдено' : 'Найди людей'}
                  </span>
                  {!chatSearchQuery && (
                  <span className="text-[56px] font-black text-black/[0.04] dark:text-white/[0.04] leading-tight tracking-tight whitespace-nowrap">
                      Начни общаться
                    </span>
                  )}
                </div>
                {/* Icon */}
                <div className="relative z-10 mb-5 w-[88px] h-[88px] rounded-full bg-[#eef1ff] dark:bg-[#1e1e24] flex items-center justify-center shadow-[0_8px_28px_rgba(21,44,255,0.14)]">
                  <MessageSquare className="h-9 w-9 text-[#152cff]/50" />
                </div>
                {/* CTA */}
                <Button
                  onClick={() => { resetSearch(); onTabChange('search') }}
                  className="relative z-10 bg-white dark:bg-white/[0.08] hover:bg-gray-50 dark:hover:bg-white/[0.12] text-black dark:text-white border-0 rounded-full px-8 h-[42px] text-[15px] font-medium shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
                >
                  Начать общение
                </Button>
              </div>
            ) : (
              <div className="px-2 pb-[128px] md:pb-2">
                {isAdminUser && (
                  <button
                    onClick={() => onSelectChat?.(adminbotChat)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-left mb-1.5',
                      activeChatId === 'adminbot'
                        ? 'bg-[#152cff]/[0.08] dark:bg-[#5d6cf5]/[0.15]'
                        : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                    )}
                  >
                    <div className="h-12 w-12 rounded-full bg-[#5d6cf5]/15 text-[#5d6cf5] flex items-center justify-center flex-shrink-0">
                      <Bot className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold truncate text-[14px] text-black dark:text-white">adminbot</span>
                        <VerifiedBadge />
                      </div>
                      <div className="text-[13px] text-black/50 dark:text-white/50 truncate leading-snug">
                        Сгенерируйте ссылку на админ-панель
                      </div>
                    </div>
                  </button>
                )}
                {filteredChats.map(chat => {
                  const peerUserId = !chat.isGroup ? chat.members.find(m => m.id !== user?.id)?.id ?? null : null
                  const peer = !chat.isGroup ? chat.members.find(m => m.id !== user?.id) : null
                  const chatStory = peerUserId ? storiesByUser.get(peerUserId) : null
                  const hasStory = !!chatStory
                  return (
                  <button
                    key={chat.id}
                    onClick={() => onSelectChat?.(chat)}
                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setChatMenu({ chat, x: e.clientX, y: e.clientY }) }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-left',
                      activeChatId === chat.id
                        ? 'bg-[#152cff]/[0.08] dark:bg-[#5d6cf5]/[0.15]'
                        : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                    )}>
                    <span
                      role={hasStory ? 'button' : undefined}
                      tabIndex={hasStory ? 0 : -1}
                      onClick={e => {
                        if (!hasStory || !peerUserId) return
                        e.preventDefault()
                        e.stopPropagation()
                        openStory(peerUserId)
                      }}
                      onKeyDown={e => {
                        if (!hasStory || !peerUserId) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          openStory(peerUserId)
                        }
                      }}
                      className={cn('flex-shrink-0 rounded-full', hasStory && 'cursor-pointer')}
                      title={hasStory ? 'Открыть сторис' : undefined}
                    >
                      <span className={cn(
                        'inline-flex rounded-full p-[2px]',
                        hasStory
                          ? chatStory?.hasUnseen
                            ? 'bg-gradient-to-br from-[#ff4d67] via-[#f7b142] to-[#5d6cf5]'
                            : 'bg-black/15 dark:bg-white/15'
                          : ''
                      )}>
                        <Avatar className="h-12 w-12">
                          {chat.avatarUrl && <AvatarImage src={chat.avatarUrl} alt={chat.title} />}
                          <AvatarFallback className={cn(
                            'font-semibold text-white text-sm',
                            chat.isGroup ? 'bg-violet-500' : 'bg-[#152cff]'
                          )}>
                            {chat.isGroup ? <Users className="h-5 w-5" /> : getInitials(chat.title)}
                          </AvatarFallback>
                        </Avatar>
                      </span>
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-1.5">
                          <span className="font-semibold truncate text-[14px] text-black dark:text-white">
                            {chat.title}
                          </span>
                          {peer?.isBadgeVerified && <VerifiedBadge className="flex-shrink-0" />}
                        </div>
                        {chat.lastMessage?.createdAt && (
                          <span className={cn('text-[11px] flex-shrink-0',
                            (unreadCounts[chat.id] ?? 0) > 0 ? 'text-[#152cff]' : 'text-black/40 dark:text-white/40')}>
                            {formatTime(chat.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {chat.lastMessage ? (
                          <span className="text-[13px] text-black/50 dark:text-white/50 truncate leading-snug">{getPreview(chat) || '...'}</span>
                        ) : chat.gameMode ? (
                          <span className="text-[13px] text-[#5d6cf5]/70 dark:text-[#8b97ff]/70 truncate leading-snug">🎮 Игровая комната</span>
                        ) : (
                          <span className="text-[13px] text-black/30 dark:text-white/30">Нет сообщений</span>
                        )}
                        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                          {mutedChats[chat.id] && (
                            <BellOff className="h-3 w-3 text-black/30 dark:text-white/30" />
                          )}
                          {(unreadCounts[chat.id] ?? 0) > 0 && (
                            <span className={cn(
                              'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white leading-none',
                              mutedChats[chat.id] ? 'bg-black/20' : 'bg-[#152cff]'
                            )}>
                              {(unreadCounts[chat.id] ?? 0) > 99 ? '99+' : unreadCounts[chat.id]}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                )})}
              </div>
            )}
          </div>
        </>
      )}

      {/* Tab: Search (find people / create chats) */}
      {activeTab === 'search' && (
        <div className="flex flex-col flex-1 min-h-0 px-3">
          {/* Personal / Group toggle */}
          <div className="flex bg-black/[0.05] dark:bg-white/[0.07] rounded-xl p-1 gap-1 mb-3 flex-shrink-0">
            <button
              onClick={() => { setIsGroupMode(false); setIsPersonalChannel(false) }}
              className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all font-medium',
                !isGroupMode ? 'bg-white dark:bg-white/[0.12] text-black dark:text-white shadow-sm' : 'text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60')}
            >
              <MessageSquare className="h-4 w-4" /> Личный
            </button>
            <button
              onClick={() => setIsGroupMode(true)}
              className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all font-medium',
                isGroupMode ? 'bg-white dark:bg-white/[0.12] text-black dark:text-white shadow-sm' : 'text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60')}
            >
              <Users className="h-4 w-4" /> Группа
            </button>
          </div>

          {isGroupMode && (
            <>
              <Input
                placeholder={isPersonalChannel ? 'Название личного канала' : 'Название группы'}
                value={groupTitle}
                onChange={e => setGroupTitle(e.target.value)}
                className="mb-2 bg-black/[0.05] dark:bg-white/[0.07] border-0 text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 rounded-xl h-10 flex-shrink-0"
              />
              {/* Game mode toggle */}
              <button
                onClick={() => {
                  if (isPersonalChannel) return
                  setIsGameMode(g => !g)
                }}
                className={cn(
                  'mb-3 flex-shrink-0 w-full flex items-center gap-3 px-3 h-11 rounded-xl transition-all border',
                  isGameMode
                    ? 'bg-[#5d6cf5]/[0.12] border-[#5d6cf5]/30 text-[#5d6cf5]'
                    : 'bg-black/[0.05] dark:bg-white/[0.07] border-transparent text-black/50 dark:text-white/50',
                  isPersonalChannel && 'opacity-50'
                )}
              >
                <Gamepad2 className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm font-medium flex-1 text-left">Game Mode</span>
                <span className={cn(
                  'text-[11px] px-2 py-0.5 rounded-full font-semibold',
                  isGameMode ? 'bg-[#5d6cf5] text-white' : 'bg-black/[0.08] dark:bg-white/[0.10] text-black/40 dark:text-white/40'
                )}>
                  {isGameMode ? 'ON' : 'OFF'}
                </span>
              </button>
              <button
                onClick={() => setIsPersonalChannel(v => {
                  const next = !v
                  if (next) setIsGameMode(false)
                  return next
                })}
                className={cn(
                  'mb-3 flex-shrink-0 w-full flex items-center gap-3 px-3 h-11 rounded-xl transition-all border',
                  isPersonalChannel
                    ? 'bg-[#5d6cf5]/[0.12] border-[#5d6cf5]/30 text-[#5d6cf5]'
                    : 'bg-black/[0.05] dark:bg-white/[0.07] border-transparent text-black/50 dark:text-white/50'
                )}
              >
                <Users className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm font-medium flex-1 text-left">Личный канал (пишет только создатель)</span>
                <span className={cn(
                  'text-[11px] px-2 py-0.5 rounded-full font-semibold',
                  isPersonalChannel ? 'bg-[#5d6cf5] text-white' : 'bg-black/[0.08] dark:bg-white/[0.10] text-black/40 dark:text-white/40'
                )}>
                  {isPersonalChannel ? 'ON' : 'OFF'}
                </span>
              </button>
            </>
          )}

          <div className="relative mb-3 flex-shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/30 dark:text-white/30" />
            <Input
              placeholder="Поиск пользователей..."
              value={userSearchQuery}
              onChange={e => handleUserSearch(e.target.value)}
              autoFocus
              className="pl-9 bg-black/[0.05] dark:bg-white/[0.07] border-0 text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 rounded-xl h-10 focus-visible:ring-1 focus-visible:ring-[#152cff]/30"
            />
          </div>

          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3 flex-shrink-0">
              {selectedUsers.map(u => (
                <Badge key={u.id}
                  className="bg-[#152cff]/10 text-[#152cff] border-[#152cff]/20 cursor-pointer hover:bg-[#152cff]/15 pr-1.5"
                  onClick={() => toggleUserSelection(u)}>
                  {u.username}
                  <X className="h-3 w-3 ml-1 inline" />
                </Badge>
              ))}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto">
            {searchResults.length > 0 && (
              <div className="space-y-0.5 pb-[128px] md:pb-2">
                {searchResults.map(u => (
                  <button key={u.id} onClick={() => toggleUserSelection(u)}
                    className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors">
                    <Avatar className="h-9 w-9 flex-shrink-0">
                      {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.username} />}
                      <AvatarFallback className="bg-[#152cff] text-white text-xs font-medium">
                        {getInitials(u.username)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm flex-1 text-left text-black dark:text-white">{u.username}</span>
                    {u.isBadgeVerified && <VerifiedBadge className="flex-shrink-0" />}
                    {selectedUsers.some(x => x.id === u.id) && (
                      <Check className="h-4 w-4 text-[#152cff]" />
                    )}
                  </button>
                ))}
              </div>
            )}
            {userSearchQuery.length >= 2 && searchResults.length === 0 && (
              <p className="text-center text-sm text-black/40 dark:text-white/40 py-8 pb-[128px] md:pb-8">Пользователи не найдены</p>
            )}
            {!userSearchQuery && (
              <div className="flex flex-col items-center justify-center py-10 pb-[128px] md:pb-10 text-black/30 dark:text-white/30">
                <Search className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">Введите имя для поиска</p>
              </div>
            )}
          </div>

          {selectedUsers.length > 0 && (
            <div className="pt-3 pb-[128px] md:pb-3 flex-shrink-0">
              <Button onClick={handleCreateChat} disabled={isLoading}
                className="w-full bg-[#152cff] hover:bg-[#1124e0] h-10 rounded-xl text-white font-medium">
                {isLoading ? 'Создание...' : `Создать ${isGroupMode ? 'группу' : 'чат'}`}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Tab: Profile */}
      {activeTab === 'profile' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-4 pb-[128px] md:pb-6 flex flex-col items-center gap-5 pt-2">
            {/* Avatar */}
            <div className="relative mt-2">
              <Avatar className="h-24 w-24 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                {(avatarPreview ?? user?.avatarUrl) && <AvatarImage src={avatarPreview ?? user?.avatarUrl!} className="object-cover" />}
                <AvatarFallback className="bg-[#5d6cf5] text-white text-2xl font-bold">
                  {getInitials(profileUsername || user?.username || '?')}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-[#5d6cf5] flex items-center justify-center shadow-[0px_6px_20px_0px_rgba(21,44,255,0.25)] transition-colors hover:bg-[#4a5be0]"
              >
                <Camera className="h-4 w-4 text-white" />
              </button>
              {avatarPreview && (
                <button
                  onClick={clearAvatarPreview}
                  className="absolute top-0 right-0 h-6 w-6 rounded-full bg-black/20 hover:bg-black/30 flex items-center justify-center"
                >
                  <X className="h-3.5 w-3.5 text-white" />
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>
            <div className="w-full">
              <Button
                onClick={() => storyFileInputRef.current?.click()}
                disabled={isUploadingStory}
                className="w-full h-10 rounded-xl bg-black/[0.06] dark:bg-white/[0.10] text-black dark:text-white hover:bg-black/[0.10] dark:hover:bg-white/[0.16]"
              >
                {isUploadingStory ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Добавить сторис (фото/видео до {STORY_MAX_VIDEO_DURATION_SECONDS}с)
              </Button>
              <input
                ref={storyFileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleStoryUpload}
              />
            </div>

            {/* Username */}
            <div className="w-full space-y-1.5">
              <label className="text-xs text-black/40 dark:text-white/40 font-semibold uppercase tracking-wider px-1">Имя пользователя</label>
              <Input
                value={profileUsername}
                onChange={e => setProfileUsername(e.target.value)}
                placeholder="Введите имя"
                className="bg-black/[0.05] dark:bg-white/[0.07] border-0 text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 rounded-xl h-11 text-[15px]"
                onKeyDown={e => { if (e.key === 'Enter') handleProfileSave() }}
              />
            </div>

            {/* Email (read-only) */}
            {user?.email && (
              <div className="w-full space-y-1.5">
                <label className="text-xs text-black/40 dark:text-white/40 font-semibold uppercase tracking-wider px-1">Email</label>
                <div className="bg-black/[0.05] dark:bg-white/[0.07] rounded-xl h-11 flex items-center px-3">
                  <span className="text-[15px] text-black/50 dark:text-white/50 flex items-center gap-1.5">
                    {user.email}
                    {user.isBadgeVerified && <VerifiedBadge />}
                  </span>
                </div>
              </div>
            )}

            <Accordion type="multiple" defaultValue={['general', 'notifications', 'appearance', 'audio', 'media']} className="w-full rounded-xl bg-black/[0.04] dark:bg-white/[0.06] px-3">
              <AccordionItem value="general" className="border-black/10 dark:border-white/10">
                <AccordionTrigger className="text-black dark:text-white">Общие</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="w-full space-y-1.5">
                    <label className="text-xs text-black/40 dark:text-white/40 font-semibold uppercase tracking-wider px-1">О себе (Messme)</label>
                    <Textarea
                      value={profileBio}
                      onChange={e => setProfileBio(e.target.value)}
                      placeholder="Расскажите о себе"
                      maxLength={240}
                      className="bg-black/[0.05] dark:bg-white/[0.07] border-0 text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 rounded-xl min-h-[88px]"
                    />
                  </div>
                  <div className="w-full space-y-1.5">
                    <label className="text-xs text-black/40 dark:text-white/40 font-semibold uppercase tracking-wider px-1">Описание канала ClipMe</label>
                    <Textarea
                      value={profileClipMeBio}
                      onChange={e => setProfileClipMeBio(e.target.value)}
                      placeholder="Описание вашего канала ClipMe"
                      maxLength={240}
                      className="bg-black/[0.05] dark:bg-white/[0.07] border-0 text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 rounded-xl min-h-[88px]"
                    />
                  </div>
                  <div className="w-full space-y-1.5">
                    <label className="text-xs text-black/40 dark:text-white/40 font-semibold uppercase tracking-wider px-1">Привязанный Messme канал</label>
                    <select
                      value={linkedMessmeChannelId}
                      onChange={e => setLinkedMessmeChannelId(e.target.value)}
                      className="w-full h-10 bg-white dark:bg-black/[0.25] border border-black/[0.1] dark:border-white/[0.12] rounded-lg px-2 text-sm text-black dark:text-white"
                    >
                      <option value="">Не привязан</option>
                      {ownedPersonalChannels.map(channel => (
                        <option key={channel.id} value={channel.id}>
                          {channel.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="notifications" className="border-black/10 dark:border-white/10">
                <AccordionTrigger className="text-black dark:text-white">Уведомления</AccordionTrigger>
                <AccordionContent>
                  <div className="w-full flex items-center justify-between bg-black/[0.05] dark:bg-white/[0.07] rounded-xl px-4 h-14">
                    <div className="flex items-center gap-3">
                      {notificationsEnabled
                        ? <Bell className="h-5 w-5 text-black/50 dark:text-white/50" />
                        : <BellOff className="h-5 w-5 text-black/30 dark:text-white/30" />
                      }
                      <div>
                        <p className="text-[15px] font-medium text-black dark:text-white">Уведомления</p>
                        <p className="text-xs text-black/40 dark:text-white/40">{notificationsEnabled ? 'Включены' : 'Отключены'}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                      className={cn(
                        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
                        notificationsEnabled ? 'bg-[#5d6cf5]' : 'bg-black/[0.15] dark:bg-white/[0.15]'
                      )}
                    >
                      <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', notificationsEnabled ? 'translate-x-6' : 'translate-x-1')} />
                    </button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="appearance" className="border-black/10 dark:border-white/10">
                <AccordionTrigger className="text-black dark:text-white">Внешний вид</AccordionTrigger>
                <AccordionContent>
                  <div className="w-full flex items-center justify-between bg-black/[0.05] dark:bg-white/[0.07] rounded-xl px-4 h-14">
                    <div className="flex items-center gap-3">
                      {darkMode ? <Moon className="h-5 w-5 text-black/50 dark:text-white/50" /> : <Sun className="h-5 w-5 text-black/50" />}
                      <div>
                        <p className="text-[15px] font-medium text-black dark:text-white">Тёмная тема</p>
                        <p className="text-xs text-black/40 dark:text-white/40">{darkMode ? 'Включена' : 'Выключена'}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setDarkMode(!darkMode)}
                      className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none', darkMode ? 'bg-[#5d6cf5]' : 'bg-black/[0.15] dark:bg-white/[0.15]')}
                    >
                      <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', darkMode ? 'translate-x-6' : 'translate-x-1')} />
                    </button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="audio" className="border-black/10 dark:border-white/10">
                <AccordionTrigger className="text-black dark:text-white">Аудио</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="w-full bg-black/[0.05] dark:bg-white/[0.07] rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3 mb-2">
                      <Mic className="h-5 w-5 text-black/50 dark:text-white/50" />
                      <div>
                        <p className="text-[15px] font-medium text-black dark:text-white">Устройство ввода</p>
                        <p className="text-xs text-black/40 dark:text-white/40">Микрофон</p>
                      </div>
                    </div>
                    <select value={audioInputDeviceId ?? ''} onChange={e => setAudioInputDeviceId(e.target.value || null)} className="w-full h-10 bg-white dark:bg-black/[0.25] border border-black/[0.1] dark:border-white/[0.12] rounded-lg px-2 text-sm text-black dark:text-white">
                      <option value="">Системный по умолчанию</option>
                      {audioInputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Микрофон ${d.deviceId.slice(0, 6)}`}</option>)}
                    </select>
                  </div>
                  <div className="w-full bg-black/[0.05] dark:bg-white/[0.07] rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3 mb-2">
                      <Headphones className="h-5 w-5 text-black/50 dark:text-white/50" />
                      <div>
                        <p className="text-[15px] font-medium text-black dark:text-white">Устройство вывода</p>
                        <p className="text-xs text-black/40 dark:text-white/40">Наушники / динамики</p>
                      </div>
                    </div>
                    <select value={audioOutputDeviceId ?? ''} onChange={e => setAudioOutputDeviceId(e.target.value || null)} className="w-full h-10 bg-white dark:bg-black/[0.25] border border-black/[0.1] dark:border-white/[0.12] rounded-lg px-2 text-sm text-black dark:text-white">
                      <option value="">Системный по умолчанию</option>
                      {audioOutputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Output ${d.deviceId.slice(0, 6)}`}</option>)}
                    </select>
                  </div>
                  <div className="w-full bg-black/[0.05] dark:bg-white/[0.07] rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3 mb-2">
                      {microphoneVolume > 0 ? <Volume2 className="h-5 w-5 text-black/50 dark:text-white/50" /> : <VolumeX className="h-5 w-5 text-black/30 dark:text-white/30" />}
                      <div>
                        <p className="text-[15px] font-medium text-black dark:text-white">Громкость микрофона</p>
                        <p className="text-xs text-black/40 dark:text-white/40">{microphoneVolume}%</p>
                      </div>
                    </div>
                    <Slider min={0} max={100} step={1} value={[microphoneVolume]} onValueChange={(value) => setMicrophoneVolume(value[0] ?? 0)} className="w-full" />
                  </div>
                  <div className="w-full bg-black/[0.05] dark:bg-white/[0.07] rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3 mb-2">
                      {outputVolume > 0 ? <Headphones className="h-5 w-5 text-black/50 dark:text-white/50" /> : <VolumeX className="h-5 w-5 text-black/30 dark:text-white/30" />}
                      <div>
                        <p className="text-[15px] font-medium text-black dark:text-white">Громкость выхода</p>
                        <p className="text-xs text-black/40 dark:text-white/40">{outputVolume}%</p>
                      </div>
                    </div>
                    <Slider min={0} max={200} step={1} value={[outputVolume]} onValueChange={(value) => setOutputVolume(value[0] ?? 0)} className="w-full" />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="media" className="border-black/10 dark:border-white/10">
                <AccordionTrigger className="text-black dark:text-white">Медиа</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="w-full flex items-center justify-between bg-black/[0.05] dark:bg-white/[0.07] rounded-xl px-4 h-14">
                    <div className="flex items-center gap-3">
                      <Bell className="h-5 w-5 text-black/50 dark:text-white/50" />
                      <div>
                        <p className="text-[15px] font-medium text-black dark:text-white">Звуки интерфейса</p>
                        <p className="text-xs text-black/40 dark:text-white/40">{soundEffectsEnabled ? 'Включены' : 'Отключены'}</p>
                      </div>
                    </div>
                    <button onClick={() => setSoundEffectsEnabled(!soundEffectsEnabled)} className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none', soundEffectsEnabled ? 'bg-[#5d6cf5]' : 'bg-black/[0.15] dark:bg-white/[0.15]')}>
                      <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', soundEffectsEnabled ? 'translate-x-6' : 'translate-x-1')} />
                    </button>
                  </div>
                  <div className="w-full flex items-center justify-between bg-black/[0.05] dark:bg-white/[0.07] rounded-xl px-4 h-14">
                    <div className="flex items-center gap-3">
                      <Film className="h-5 w-5 text-black/50 dark:text-white/50" />
                      <div>
                        <p className="text-[15px] font-medium text-black dark:text-white">Автовоспроизведение медиа</p>
                        <p className="text-xs text-black/40 dark:text-white/40">{autoPlayMedia ? 'Включено' : 'Отключено'}</p>
                      </div>
                    </div>
                    <button onClick={() => setAutoPlayMedia(!autoPlayMedia)} className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none', autoPlayMedia ? 'bg-[#5d6cf5]' : 'bg-black/[0.15] dark:bg-white/[0.15]')}>
                      <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', autoPlayMedia ? 'translate-x-6' : 'translate-x-1')} />
                    </button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {profileError && <p className="text-red-500 text-sm text-center">{profileError}</p>}

            <Button
              variant="ghost"
              onClick={() => onTabChange('clipme')}
              className="w-full h-10 rounded-xl bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.12]"
            >
              <Film className="h-4 w-4 mr-2" />
              Открыть мой канал ClipMe
            </Button>

            {/* Save */}
            <Button
              onClick={handleProfileSave}
              disabled={isSaving || !profileUsername.trim()}
              className="w-full bg-[#5d6cf5] hover:bg-[#4a5be0] h-11 rounded-xl text-white font-semibold text-[15px] shadow-[0px_6px_20px_0px_rgba(21,44,255,0.25)]"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1.5" />Сохранить</>}
            </Button>

            {/* Logout */}
            <button
              onClick={() => onLogout?.()}
              className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-red-50 dark:bg-red-500/[0.12] text-red-500 font-semibold text-[15px] hover:bg-red-100 dark:hover:bg-red-500/[0.18] transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Выйти
            </button>
          </div>
        </div>
      )}

      {activeTab === 'clipme' && (
        <ClipMeTab onClose={() => onTabChange('chats')} initialVideoId={initialClipVideoId} />
      )}

      {/* Bottom navigation — desktop only; mobile nav is rendered in the parent page */}
      <div className={cn('hidden md:block flex-shrink-0 px-3 pt-2 pb-3', activeTab === 'clipme' && 'hidden')} style={{ background: darkMode ? 'rgba(17,17,18,0.85)' : 'rgba(255,255,255,0.8)', backdropFilter: 'blur(20px)', boxShadow: darkMode ? '0px -1px 0px 0px rgba(255,255,255,0.06)' : '0px -1px 0px 0px rgba(0,0,0,0.06)' }}>
        <div className="flex items-center justify-around bg-black/[0.05] dark:bg-white/[0.08] rounded-2xl px-1 py-2">
          {/* Chats tab */}
          <button
            onClick={() => onTabChange('chats')}
            className="flex flex-col items-center gap-1 flex-1"
          >
            <div className={cn(
              'relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200',
              activeTab === 'chats'
                ? 'bg-white/80 dark:bg-white/[0.15]'
                : ''
            )}
            style={activeTab === 'chats' ? { boxShadow: '0px 6px 20px 0px rgba(21,44,255,0.25)' } : undefined}
            >
              <MessageSquare className={cn('h-5 w-5', activeTab === 'chats' ? 'text-black dark:text-white' : 'text-black/60 dark:text-white/60')} />
              {totalUnread > 0 && activeTab !== 'chats' && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#5d6cf5] px-1 text-[10px] font-bold text-white leading-none">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </div>
            <span className={cn('text-[11px] font-bold', activeTab === 'chats' ? 'text-black dark:text-white' : 'text-black/60 dark:text-white/60')}>Чаты</span>
          </button>

          {/* Search tab */}
          <button
            onClick={() => { resetSearch(); onTabChange('search') }}
            className="flex flex-col items-center gap-1 flex-1"
          >
            <div className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200',
              activeTab === 'search' ? 'bg-white/80 dark:bg-white/[0.15]' : ''
            )}
            style={activeTab === 'search' ? { boxShadow: '0px 6px 20px 0px rgba(21,44,255,0.25)' } : undefined}
            >
              <Search className={cn('h-5 w-5', activeTab === 'search' ? 'text-black dark:text-white' : 'text-black/60 dark:text-white/60')} />
            </div>
            <span className={cn('text-[11px] font-bold', activeTab === 'search' ? 'text-black dark:text-white' : 'text-black/60 dark:text-white/60')}>Поиск</span>
          </button>

          {/* Profile tab */}
          <button
            onClick={() => { setProfileUsername(user?.username ?? ''); setProfileError(null); onTabChange('profile') }}
            className="flex flex-col items-center gap-1 flex-1"
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center">
              {user ? (
                <div className="relative">
                  <Avatar className="h-[30px] w-[30px]">
                    {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.username} />}
                    <AvatarFallback className="bg-[#5d6cf5] text-white text-[10px] font-medium">
                      {getInitials(user.username)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#0ed221] rounded-full border-2 border-white dark:border-[#111112]" />
                </div>
              ) : (
                <UserRound className="h-5 w-5 text-black/60 dark:text-white/60" />
              )}
            </div>
            <span className="text-[11px] font-bold text-black/60 dark:text-white/60">Профиль</span>
          </button>

          <button
            onClick={() => onTabChange('clipme')}
            className="flex flex-col items-center gap-1 flex-1"
          >
            <div className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200',
              activeTab === 'clipme' ? 'bg-white/80 dark:bg-white/[0.15]' : ''
            )}
            style={activeTab === 'clipme' ? { boxShadow: '0px 6px 20px 0px rgba(21,44,255,0.25)' } : undefined}
            >
              <Film className={cn('h-5 w-5', activeTab === 'clipme' ? 'text-black dark:text-white' : 'text-black/60 dark:text-white/60')} />
            </div>
            <span className={cn('text-[11px] font-bold', activeTab === 'clipme' ? 'text-black dark:text-white' : 'text-black/60 dark:text-white/60')}>ClipMe</span>
          </button>
        </div>
      </div>

      {/* ── Chat context menu ──────────────────────────────────────────────── */}
      {chatMenu && (
        <div
          className="fixed z-50 bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/[0.08] rounded-xl shadow-2xl py-1 min-w-44"
          style={{ left: chatMenu.x, top: chatMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          {chatMenu.chat.isGroup && (
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              onClick={() => { setChatToDelete(chatMenu.chat); setChatMenu(null) }}
            >
              <LogOut className="h-4 w-4" /> Покинуть группу
            </button>
          )}
          <button
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            onClick={() => { setChatToDelete(chatMenu.chat); setChatMenu(null) }}
          >
            <Trash2 className="h-4 w-4" /> Удалить переписку
          </button>
        </div>
      )}

      {/* ── DeleteConversation/Leave AlertDialog ───────────────────────────── */}
      <AlertDialog open={!!chatToDelete} onOpenChange={open => { if (!open) setChatToDelete(null) }}>
        <AlertDialogContent className="bg-white dark:bg-[#1c1c1e] border-black/[0.08] dark:border-white/[0.08] max-w-xs">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-black dark:text-white">
              {chatToDelete?.isGroup ? 'Покинуть группу?' : 'Удалить переписку?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-black/50 dark:text-white/50">
              {chatToDelete?.isGroup
                ? `Вы покинете группу «${chatToDelete.title}». Вернуться можно только по приглашению.`
                : `Переписка с «${chatToDelete?.title}» будет удалена только у вас.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-black/[0.08] dark:border-white/[0.08] text-black dark:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08]">
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConversation}
              disabled={isDeletingChat}
              className="bg-red-500 hover:bg-red-600 text-white border-0"
            >
              {isDeletingChat ? <Loader2 className="h-4 w-4 animate-spin" /> : chatToDelete?.isGroup ? 'Покинуть' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StoryViewer
        open={!!activeStoryUserId}
        userId={activeStoryUserId}
        storyUserIds={storyFeed.map(item => item.user.id)}
        onOpenChatWithUser={handleOpenChatWithViewer}
        onOpenChange={open => {
          if (!open) {
            setActiveStoryUserId(null)
            refreshStories()
          }
        }}
      />
    </div>
  )
}
