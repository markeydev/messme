/**
 * API Client for Messenger Backend
 */

const API_BASE = '/api'

export interface User {
  id: string
  username: string
  email?: string
  avatarUrl?: string | null
}

export interface Chat {
  id: string
  title: string
  isGroup: boolean
  gameMode?: boolean
  avatarUrl?: string | null
  ownerId?: string | null
  members: Array<{
    id: string
    username: string
    avatarUrl?: string | null
  }>
  lastMessage?: {
    id: string
    content: string
    type?: string
    fileName?: string | null
    createdAt: string
    senderId: string
  } | null
  updatedAt?: string
  hasMore?: boolean
}

export interface Message {
  id: string
  chatId: string
  senderId: string
  senderUsername?: string
  type?: 'TEXT' | 'AUDIO' | 'IMAGE' | 'FILE' | 'VIDEO_NOTE'
  content: string
  audioUrl?: string | null
  audioDuration?: number | null
  fileUrl?: string | null
  fileName?: string | null
  fileSize?: number | null
  videoNoteUrl?: string | null
  videoNoteDuration?: number | null
  replyToId?: string | null
  replyTo?: {
    id: string
    senderId: string
    senderUsername?: string
    content: string
  } | null
  isEdited?: boolean
  isForwarded?: boolean
  forwardedFromUsername?: string | null
  createdAt: string | Date
  // Client-only optimistic status (never persisted / sent to server)
  pendingStatus?: 'sending' | 'failed'
}

// Token management
let authToken: string | null = null

export function setAuthToken(token: string | null) {
  authToken = token
  if (token) {
    localStorage.setItem('messenger_token', token)
  } else {
    localStorage.removeItem('messenger_token')
  }
}

export function getAuthToken(): string | null {
  if (!authToken) {
    authToken = localStorage.getItem('messenger_token')
  }
  return authToken
}

// Generic fetch wrapper
async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data?: T; error?: string; status?: number }> {
  const token = getAuthToken()

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    })

    const data = await response.json()

    if (!response.ok) {
      return { error: data.error || 'Произошла ошибка', status: response.status }
    }

    return { data, status: response.status }
  } catch (error) {
    console.error('API Error:', error)
    return { error: 'Ошибка соединения', status: 0 }
  }
}

// Auth API
export const authAPI = {
  async register(
    username: string,
    email: string,
    password: string
  ): Promise<{ user?: User; token?: string; needsVerification?: boolean; email?: string; error?: string }> {
    const result = await fetchAPI<{ user: User; token: string; needsVerification?: boolean; email?: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password })
    })
    if (result.data) {
      return { user: result.data.user, token: result.data.token, needsVerification: result.data.needsVerification, email: result.data.email }
    }
    return { error: result.error }
  },

  async login(
    login: string,
    password: string
  ): Promise<{ user?: User; token?: string; needsVerification?: boolean; email?: string; error?: string }> {
    const result = await fetchAPI<{ user: User; token: string; needsVerification?: boolean; email?: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password })
    })
    if (result.data) {
      return { user: result.data.user, token: result.data.token, needsVerification: result.data.needsVerification, email: result.data.email }
    }
    return { error: result.error }
  },

  async verifyEmail(email: string, code: string): Promise<{ user?: User; token?: string; error?: string }> {
    const result = await fetchAPI<{ user: User; token: string }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, code })
    })
    if (result.data) return { user: result.data.user, token: result.data.token }
    return { error: result.error }
  },

  async forgotPassword(email: string): Promise<{ success?: boolean; error?: string }> {
    const result = await fetchAPI<{ success: boolean }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    })
    if (result.data) return { success: true }
    return { error: result.error }
  },

  async resetPassword(email: string, code: string, newPassword: string): Promise<{ success?: boolean; error?: string }> {
    const result = await fetchAPI<{ success: boolean }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, code, newPassword })
    })
    if (result.data) return { success: true }
    return { error: result.error }
  },

  async me(): Promise<{ user?: User; error?: string; status?: number }> {
    const result = await fetchAPI<{ user: User }>('/auth/me')
    if (result.data) {
      return { user: result.data.user, status: result.status }
    }
    return { error: result.error, status: result.status }
  }
}

// Chats API
export const chatsAPI = {
  async getAll(): Promise<{ chats?: Chat[]; error?: string }> {
    const result = await fetchAPI<{ chats: Chat[] }>('/chats')
    if (result.data) {
      return { chats: result.data.chats }
    }
    return { error: result.error }
  },

  async create(
    memberIds: string[],
    isGroup: boolean = false,
    title?: string,
    gameMode: boolean = false
  ): Promise<{ chat?: Chat & { memberIds: string[] }; isNew?: boolean; error?: string }> {
    const result = await fetchAPI<{ chat: Chat & { memberIds: string[] }; isNew: boolean }>('/chats/create', {
      method: 'POST',
      body: JSON.stringify({ memberIds, isGroup, title, gameMode })
    })

    if (result.data) {
      return { chat: result.data.chat, isNew: result.data.isNew }
    }
    return { error: result.error }
  },

  async getById(chatId: string): Promise<{ chat?: Chat & { messages: Message[]; hasMore?: boolean }; error?: string }> {
    const result = await fetchAPI<{ chat: Chat & { messages: Message[]; hasMore?: boolean } }>(`/chats/${chatId}`)
    if (result.data) {
      return { chat: result.data.chat }
    }
    return { error: result.error }
  },

  async getMessages(chatId: string, beforeId: string): Promise<{ messages?: Message[]; hasMore?: boolean; error?: string }> {
    const result = await fetchAPI<{ messages: Message[]; hasMore: boolean }>(`/chats/${chatId}?before=${encodeURIComponent(beforeId)}`)
    if (result.data) return { messages: result.data.messages, hasMore: result.data.hasMore }
    return { error: result.error }
  },

  async addMembers(chatId: string, userIds: string[]): Promise<{ newMembers?: User[]; memberIds?: string[]; error?: string }> {
    const result = await fetchAPI<{ success: boolean; newMembers: User[]; memberIds: string[] }>(`/chats/${chatId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userIds })
    })
    if (result.data) {
      return { newMembers: result.data.newMembers, memberIds: result.data.memberIds }
    }
    return { error: result.error }
  },

  async sendMessage(chatId: string, content: string, replyToId?: string, forwardMeta?: { isForwarded: boolean; forwardedFromUsername?: string }, audioMeta?: { audioUrl: string; audioDuration?: number | null }, fileMeta?: { fileUrl: string; fileName: string; fileSize: number; type: 'IMAGE' | 'FILE' }, videoNoteMeta?: { videoNoteUrl: string; videoNoteDuration?: number | null }): Promise<{ message?: Message; error?: string }> {
    const result = await fetchAPI<{ message: Message }>(`/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        ...(replyToId ? { replyToId } : {}),
        ...(forwardMeta ? forwardMeta : {}),
        ...(audioMeta ? { type: 'AUDIO', audioUrl: audioMeta.audioUrl, audioDuration: audioMeta.audioDuration } : {}),
        ...(fileMeta ? { type: fileMeta.type, fileUrl: fileMeta.fileUrl, fileName: fileMeta.fileName, fileSize: fileMeta.fileSize } : {}),
        ...(videoNoteMeta ? { type: 'VIDEO_NOTE', videoNoteUrl: videoNoteMeta.videoNoteUrl, videoNoteDuration: videoNoteMeta.videoNoteDuration } : {}),
      })
    })
    if (result.data) return { message: result.data.message }
    return { error: result.error }
  },

  async uploadAudio(blob: Blob, duration: number): Promise<{ url?: string; duration?: number; error?: string }> {
    const token = getAuthToken()
    const form = new FormData()
    form.append('file', blob, 'voice.webm')
    form.append('duration', String(duration))
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      const data = await response.json()
      if (!response.ok) return { error: data.error }
      return { url: data.url, duration: data.duration }
    } catch {
      return { error: 'Ошибка загрузки' }
    }
  },

  async uploadFile(file: File): Promise<{ url?: string; fileName?: string; fileSize?: number; error?: string }> {
    const token = getAuthToken()
    const form = new FormData()
    form.append('file', file, file.name)
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      const data = await response.json()
      if (!response.ok) return { error: data.error }
      return { url: data.url, fileName: data.fileName, fileSize: data.fileSize }
    } catch {
      return { error: 'Ошибка загрузки' }
    }
  },

  async uploadVideoNote(blob: Blob, duration: number): Promise<{ url?: string; duration?: number; error?: string }> {
    const token = getAuthToken()
    const form = new FormData()
    form.append('file', blob, 'videonote.webm')
    form.append('duration', String(duration))
    form.append('purpose', 'videonote')
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      const data = await response.json()
      if (!response.ok) return { error: data.error }
      return { url: data.url, duration: data.duration }
    } catch {
      return { error: 'Ошибка загрузки' }
    }
  },

  async deleteMessage(chatId: string, messageId: string): Promise<{ success?: boolean; error?: string }> {
    const result = await fetchAPI<{ success: boolean }>(`/chats/${chatId}/messages/${messageId}`, {
      method: 'DELETE'
    })
    if (result.data) return { success: true }
    return { error: result.error }
  },

  async editMessage(chatId: string, messageId: string, content: string): Promise<{ message?: Message; error?: string }> {
    const result = await fetchAPI<{ message: Message }>(`/chats/${chatId}/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content })
    })
    if (result.data) return { message: result.data.message }
    return { error: result.error }
  },

  async getMembers(chatId: string): Promise<{ members?: User[]; error?: string }> {
    const result = await fetchAPI<{ members: User[] }>(`/chats/${chatId}/members`)
    if (result.data) {
      return { members: result.data.members }
    }
    return { error: result.error }
  },

  async updateGroupSettings(chatId: string, title: string, avatarUrl?: string | null): Promise<{ chat?: Partial<Chat>; error?: string }> {
    const result = await fetchAPI<{ chat: Partial<Chat> }>(`/chats/${chatId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ title, avatarUrl }),
    })
    if (result.data) return { chat: result.data.chat }
    return { error: result.error }
  },

  async leaveGroup(chatId: string): Promise<{ success?: boolean; error?: string }> {
    const result = await fetchAPI<{ success: boolean }>(`/chats/${chatId}/members`, {
      method: 'DELETE',
    })
    if (result.data) return { success: true }
    return { error: result.error }
  },
}

// Users API
export const usersAPI = {
  async search(query: string): Promise<{ users?: User[]; error?: string }> {
    const result = await fetchAPI<{ users: User[] }>(`/users/search?q=${encodeURIComponent(query)}`)
    if (result.data) {
      return { users: result.data.users }
    }
    return { error: result.error }
  },
}

// Profile / Account API
export const profileAPI = {  async updateProfile(username: string, avatarUrl?: string | null): Promise<{ user?: User; error?: string }> {
    const result = await fetchAPI<{ user: User }>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ username, avatarUrl }),
    })
    if (result.data) return { user: result.data.user }
    return { error: result.error }
  },

  async uploadAvatar(file: File, scope: 'user' | 'group'): Promise<{ url?: string; error?: string }> {
    const token = getAuthToken()
    const form = new FormData()
    form.append('file', file, file.name)
    form.append('purpose', `avatar_${scope}`)
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      const data = await response.json()
      if (!response.ok) return { error: data.error }
      return { url: data.url }
    } catch {
      return { error: 'Ошибка загрузки' }
    }
  }
}

// ─── Game Mode / Channels ────────────────────────────────────────────────────

export interface Channel {
  id: string
  chatId: string
  name: string
  type: 'TEXT' | 'VOICE'
  position: number
  createdAt: string
}

export interface ChannelMessage {
  id: string
  channelId: string
  senderId: string
  senderUsername: string
  content: string
  createdAt: string
}

export const channelsAPI = {
  async getChannels(chatId: string): Promise<{ channels?: Channel[]; error?: string }> {
    const result = await fetchAPI<{ channels: Channel[] }>(`/chats/${chatId}/channels`)
    if (result.data) return { channels: result.data.channels }
    return { error: result.error }
  },

  async createChannel(chatId: string, name: string, type: 'TEXT' | 'VOICE'): Promise<{ channel?: Channel; error?: string }> {
    const result = await fetchAPI<{ channel: Channel }>(`/chats/${chatId}/channels`, {
      method: 'POST',
      body: JSON.stringify({ name, type }),
    })
    if (result.data) return { channel: result.data.channel }
    return { error: result.error }
  },

  async deleteChannel(chatId: string, channelId: string): Promise<{ success?: boolean; error?: string }> {
    const result = await fetchAPI<{ success: boolean }>(`/chats/${chatId}/channels?channelId=${channelId}`, {
      method: 'DELETE',
    })
    if (result.data) return { success: true }
    return { error: result.error }
  },

  async getMessages(chatId: string, channelId: string): Promise<{ messages?: ChannelMessage[]; error?: string }> {
    const result = await fetchAPI<{ messages: ChannelMessage[] }>(`/chats/${chatId}/channels/${channelId}/messages`)
    if (result.data) return { messages: result.data.messages }
    return { error: result.error }
  },

  async sendMessage(chatId: string, channelId: string, content: string): Promise<{ message?: ChannelMessage; error?: string }> {
    const result = await fetchAPI<{ message: ChannelMessage }>(`/chats/${chatId}/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    })
    if (result.data) return { message: result.data.message }
    return { error: result.error }
  },

  async deleteMessage(chatId: string, channelId: string, messageId: string): Promise<{ success?: boolean; error?: string }> {
    const result = await fetchAPI<{ success: boolean }>(`/chats/${chatId}/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' })
    if (result.data) return { success: true }
    return { error: result.error }
  },

  async editMessage(chatId: string, channelId: string, messageId: string, content: string): Promise<{ message?: ChannelMessage; error?: string }> {
    const result = await fetchAPI<{ message: ChannelMessage }>(`/chats/${chatId}/channels/${channelId}/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    })
    if (result.data) return { message: result.data.message }
    return { error: result.error }
  },

  async renameChannel(chatId: string, channelId: string, name: string): Promise<{ channel?: Channel; error?: string }> {
    const result = await fetchAPI<{ channel: Channel }>(`/chats/${chatId}/channels/${channelId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    })
    if (result.data) return { channel: result.data.channel }
    return { error: result.error }
  },
}
