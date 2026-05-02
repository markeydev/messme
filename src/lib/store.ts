import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Chat, Message } from './api'

interface MessengerState {
  // Auth state
  user: User | null
  token: string | null
  isAuthenticated: boolean

  // Chat state
  chats: Chat[]
  activeChatId: string | null
  activeChat: Chat | null
  messages: Map<string, Message[]>

  // Unread counts (not persisted)
  unreadCounts: Record<string, number>

  // Notification preferences (persisted)
  notificationsEnabled: boolean
  mutedChats: Record<string, boolean>
  microphoneVolume: number
  outputVolume: number
  audioInputDeviceId: string | null
  audioOutputDeviceId: string | null
  soundEffectsEnabled: boolean
  autoPlayMedia: boolean
  noiseSuppressionEnabled: boolean
  noiseSuppressionLevel: number // 0–100
  // Active voice channel info (runtime only, not persisted)
  activeVoiceInfo: { chatId: string; channelName: string; chatName: string } | null
  setActiveVoiceInfo: (info: { chatId: string; channelName: string; chatName: string } | null) => void
  // UI state
  isLoading: boolean
  error: string | null

  // Actions
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  setAuthenticated: (isAuthenticated: boolean) => void
  logout: () => void

  setChats: (chats: Chat[]) => void
  addChat: (chat: Chat) => void
  removeChat: (chatId: string) => void
  setActiveChat: (chat: Chat | null) => void
  setActiveChatId: (chatId: string | null) => void

  setMessages: (chatId: string, messages: Message[]) => void
  prependMessages: (chatId: string, messages: Message[], hasMore: boolean) => void
  addMessage: (chatId: string, message: Message) => void
  deleteMessage: (chatId: string, messageId: string) => void
  updateMessage: (chatId: string, messageId: string, newContent: string, isEdited: boolean) => void
  updateMessageReactions: (chatId: string, messageId: string, reactions: Array<{ emoji: string; count: number; reactedByMe: boolean }>) => void
  replaceMessage: (chatId: string, tempId: string, realMessage: Message) => void
  updateMessageStatus: (chatId: string, messageId: string, status: 'sending' | 'failed') => void
  updateChatMembers: (chatId: string, members: Chat['members']) => void
  updateUser: (patch: Partial<User>) => void
  updateChat: (chatId: string, patch: Partial<Chat>) => void

  incrementUnread: (chatId: string) => void
  clearUnread: (chatId: string) => void

  setNotificationsEnabled: (enabled: boolean) => void
  toggleMuteChat: (chatId: string) => void
  setMicrophoneVolume: (volume: number) => void
  setOutputVolume: (volume: number) => void
  setAudioInputDeviceId: (deviceId: string | null) => void
  setAudioOutputDeviceId: (deviceId: string | null) => void
  setSoundEffectsEnabled: (enabled: boolean) => void
  setAutoPlayMedia: (enabled: boolean) => void
  setNoiseSuppressionEnabled: (enabled: boolean) => void
  setNoiseSuppressionLevel: (level: number) => void

  darkMode: boolean
  setDarkMode: (dark: boolean) => void

  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
}

export const useMessengerStore = create<MessengerState>()(
  persist(
    (set) => ({
      // Initial state
      user: null,
      token: null,
      isAuthenticated: false,

      chats: [],
      activeChatId: null,
      activeChat: null,
      messages: new Map(),

      unreadCounts: {},

      notificationsEnabled: true,
      mutedChats: {},
      microphoneVolume: 75,
      outputVolume: 100,
      audioInputDeviceId: null,
      audioOutputDeviceId: null,
      soundEffectsEnabled: true,
      autoPlayMedia: true,
      noiseSuppressionEnabled: true,
      noiseSuppressionLevel: 50,
      activeVoiceInfo: null,

      darkMode: false,

      isLoading: false,
      error: null,

      // Actions
      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),

      logout: () => set({
        user: null,
        token: null,
        isAuthenticated: false,
        chats: [],
        activeChatId: null,
        activeChat: null,
        messages: new Map(),
        unreadCounts: {},
        mutedChats: {}
      }),

      setChats: (chats) => set({ chats }),
      addChat: (chat) => set((state) => {
        if (state.chats.some(c => c.id === chat.id)) return state
        return { chats: [chat, ...state.chats] }
      }),

      removeChat: (chatId) => set((state) => ({
        chats: state.chats.filter(c => c.id !== chatId),
        activeChatId: state.activeChatId === chatId ? null : state.activeChatId,
        activeChat: state.activeChat?.id === chatId ? null : state.activeChat,
      })),

      setActiveChat: (chat) => set((state) => ({
        activeChat: chat,
        activeChatId: chat?.id || null,
        unreadCounts: chat
          ? { ...state.unreadCounts, [chat.id]: 0 }
          : state.unreadCounts
      })),

      setActiveChatId: (chatId) => set({ activeChatId: chatId }),

      setMessages: (chatId, messages) => set((state) => {
        const newMessages = new Map(state.messages)
        newMessages.set(chatId, messages)
        return { messages: newMessages }
      }),

      prependMessages: (chatId, olderMessages, hasMore) => set((state) => {
        const newMessages = new Map(state.messages)
        const existing = newMessages.get(chatId) || []
        // Deduplicate then prepend older messages
        const existingIds = new Set(existing.map(m => m.id))
        const fresh = olderMessages.filter(m => !existingIds.has(m.id))
        newMessages.set(chatId, [...fresh, ...existing])
        const newChats = state.chats.map(c => c.id === chatId ? { ...c, hasMore } : c)
        return { messages: newMessages, chats: newChats }
      }),

      addMessage: (chatId, message) => set((state) => {
        const newMessages = new Map(state.messages)
        const existing = newMessages.get(chatId) || []
        // Deduplicate by message id
        if (existing.some(m => m.id === message.id)) return state
        newMessages.set(chatId, [...existing, message])
        // Update chat.lastMessage so the chat list preview stays current
        const newChats = state.chats.map(c =>
          c.id === chatId
            ? { ...c, lastMessage: { id: message.id, type: message.type, content: message.content, fileName: (message as any).fileName ?? null, createdAt: typeof message.createdAt === 'string' ? message.createdAt : new Date(message.createdAt).toISOString(), senderId: message.senderId } }
            : c
        )
        return { messages: newMessages, chats: newChats }
      }),

      deleteMessage: (chatId, messageId) => set((state) => {
        const newMessages = new Map(state.messages)
        const existing = newMessages.get(chatId) || []
        newMessages.set(chatId, existing.filter(m => m.id !== messageId))
        return { messages: newMessages }
      }),

      updateMessage: (chatId, messageId, newContent, isEdited) => set((state) => {
        const newMessages = new Map(state.messages)
        const existing = newMessages.get(chatId) || []
        newMessages.set(chatId, existing.map(m =>
          m.id === messageId
            ? { ...m, content: newContent, isEdited }
            : m
        ))
        return { messages: newMessages }
      }),

      updateMessageReactions: (chatId, messageId, reactions) => set((state) => {
        const newMessages = new Map(state.messages)
        const existing = newMessages.get(chatId) || []
        newMessages.set(chatId, existing.map(m =>
          m.id === messageId
            ? { ...m, reactions }
            : m
        ))
        return { messages: newMessages }
      }),

      replaceMessage: (chatId, tempId, realMessage) => set((state) => {
        const newMessages = new Map(state.messages)
        const existing = newMessages.get(chatId) || []
        // Avoid duplicate if server echo already arrived
        const hasReal = existing.some(m => m.id === realMessage.id)
        if (hasReal) {
          newMessages.set(chatId, existing.filter(m => m.id !== tempId))
        } else {
          newMessages.set(chatId, existing.map(m => m.id === tempId ? realMessage : m))
        }
        // Keep chat.lastMessage in sync with the confirmed real message
        const newChats = state.chats.map(c =>
          c.id === chatId
            ? { ...c, lastMessage: { id: realMessage.id, type: realMessage.type, content: realMessage.content, fileName: (realMessage as any).fileName ?? null, createdAt: typeof realMessage.createdAt === 'string' ? realMessage.createdAt : new Date(realMessage.createdAt).toISOString(), senderId: realMessage.senderId } }
            : c
        )
        return { messages: newMessages, chats: newChats }
      }),

      updateMessageStatus: (chatId, messageId, status) => set((state) => {
        const newMessages = new Map(state.messages)
        const existing = newMessages.get(chatId) || []
        newMessages.set(chatId, existing.map(m =>
          m.id === messageId ? { ...m, pendingStatus: status } : m
        ))
        return { messages: newMessages }
      }),

      updateChatMembers: (chatId, members) => set((state) => ({
        chats: state.chats.map(chat =>
          chat.id === chatId ? { ...chat, members } : chat
        ),
        activeChat: state.activeChat?.id === chatId
          ? { ...state.activeChat, members }
          : state.activeChat
      })),

      updateUser: (patch) => set((state) => ({
        user: state.user ? { ...state.user, ...patch } : state.user
      })),

      updateChat: (chatId, patch) => set((state) => ({
        chats: state.chats.map(c => c.id === chatId ? { ...c, ...patch } : c),
        activeChat: state.activeChat?.id === chatId
          ? { ...state.activeChat, ...patch }
          : state.activeChat
      })),

      incrementUnread: (chatId) => set((state) => ({
        unreadCounts: {
          ...state.unreadCounts,
          [chatId]: (state.unreadCounts[chatId] ?? 0) + 1
        }
      })),

      clearUnread: (chatId) => set((state) => ({
        unreadCounts: { ...state.unreadCounts, [chatId]: 0 }
      })),

      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),

      toggleMuteChat: (chatId) => set((state) => ({
        mutedChats: { ...state.mutedChats, [chatId]: !state.mutedChats[chatId] }
      })),

      setMicrophoneVolume: (volume) => set({ microphoneVolume: Math.max(0, Math.min(100, volume)) }),
      setOutputVolume: (volume) => set({ outputVolume: Math.max(0, Math.min(200, volume)) }),
      setAudioInputDeviceId: (deviceId) => set({ audioInputDeviceId: deviceId }),
      setAudioOutputDeviceId: (deviceId) => set({ audioOutputDeviceId: deviceId }),
      setSoundEffectsEnabled: (enabled) => set({ soundEffectsEnabled: enabled }),
      setAutoPlayMedia: (enabled) => set({ autoPlayMedia: enabled }),
      setNoiseSuppressionEnabled: (enabled) => set({ noiseSuppressionEnabled: enabled }),
      setNoiseSuppressionLevel: (level) => set({ noiseSuppressionLevel: Math.max(0, Math.min(100, level)) }),
      setActiveVoiceInfo: (info) => set({ activeVoiceInfo: info }),

      setDarkMode: (dark) => set({ darkMode: dark }),

      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),

    }),
    {
      name: 'messenger-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        chats: state.chats,
        notificationsEnabled: state.notificationsEnabled,
        mutedChats: state.mutedChats,
        darkMode: state.darkMode,
        microphoneVolume: state.microphoneVolume,
        outputVolume: state.outputVolume,
        audioInputDeviceId: state.audioInputDeviceId,
        audioOutputDeviceId: state.audioOutputDeviceId,
        soundEffectsEnabled: state.soundEffectsEnabled,
        autoPlayMedia: state.autoPlayMedia,
        noiseSuppressionEnabled: state.noiseSuppressionEnabled,
        noiseSuppressionLevel: state.noiseSuppressionLevel,
      }),
      // Custom serialization for Map
      storage: {
        getItem: (name) => {
          try {
            const str = localStorage.getItem(name)
            return str ? JSON.parse(str) : null
          } catch {
            return null
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value))
          } catch {
            // localStorage unavailable (Private Mode, quota exceeded) — ignore
          }
        },
        removeItem: (name) => {
          try { localStorage.removeItem(name) } catch {}
        },
      }
    }
  )
)
