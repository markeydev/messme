/**
 * API Client for Messenger Backend
 */

const API_BASE = '/api'

export interface User {
  id: string
  username: string
  email?: string
  avatarUrl?: string | null
  bio?: string | null
  linkedMessmeChannelId?: string | null
  clipMeBio?: string | null
  isBadgeVerified?: boolean
  isAdmin?: boolean
  isBlocked?: boolean
}

export interface Chat {
  id: string
  title: string
  isGroup: boolean
  isPersonalChannel?: boolean
  gameMode?: boolean
  avatarUrl?: string | null
  ownerId?: string | null
  members: Array<{
    id: string
    username: string
    avatarUrl?: string | null
    isBadgeVerified?: boolean
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
  forwardedFromChatId?: string | null
  createdAt: string | Date
  // Client-only optimistic status (never persisted / sent to server)
  pendingStatus?: 'sending' | 'failed'
  reactions?: Array<{ emoji: string; count: number; reactedByMe: boolean }>
}

export interface Story {
  id: string
  user: Pick<User, 'id' | 'username' | 'avatarUrl'>
  mediaUrl: string
  mediaType: 'IMAGE' | 'VIDEO'
  videoDuration?: number | null
  createdAt: string
  expiresAt: string
  viewsCount: number
  likesCount: number
  likedByMe: boolean
  seenByMe: boolean
  viewers?: Array<Pick<User, 'id' | 'username' | 'avatarUrl'>>
  likes?: Array<Pick<User, 'id' | 'username' | 'avatarUrl'>>
}

export interface StoryFeedItem {
  user: Pick<User, 'id' | 'username' | 'avatarUrl'>
  hasUnseen: boolean
  storiesCount: number
  latestStoryAt: string
}

export type ClipMePrivacy = 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE'

export interface ClipMeVideo {
  id: string
  user: Pick<User, 'id' | 'username' | 'avatarUrl' | 'isBadgeVerified'>
  videoUrl: string
  description: string
  privacy: ClipMePrivacy
  createdAt: string
  viewsCount: number
  likesCount: number
  repostsCount: number
  commentsCount: number
  likedByMe: boolean
  repostedByMe: boolean
}

export interface ClipMeComment {
  id: string
  content: string
  createdAt: string
  parentId: string | null
  repliesCount: number
  likesCount: number
  likedByMe: boolean
  user: Pick<User, 'id' | 'username' | 'avatarUrl' | 'isBadgeVerified'>
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
  options: RequestInit = {},
  timeoutMs = 12000
): Promise<{ data?: T; error?: string; status?: number }> {
  const token = getAuthToken()

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    })

    const data = await response.json()

    if (!response.ok) {
      return { error: data.error || 'Произошла ошибка', status: response.status }
    }

    return { data, status: response.status }
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      return { error: 'Превышено время ожидания', status: 0 }
    }
    console.error('API Error:', error)
    return { error: 'Ошибка соединения', status: 0 }
  } finally {
    clearTimeout(timer)
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

export const adminbotAPI = {
  async generatePanelLink(): Promise<{ url?: string; expiresAt?: string; error?: string }> {
    const result = await fetchAPI<{ url: string; expiresAt: string }>('/adminbot/generate-panel-link', {
      method: 'POST',
    })
    if (result.data) return { url: result.data.url, expiresAt: result.data.expiresAt }
    return { error: result.error }
  },
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
    gameMode: boolean = false,
    isPersonalChannel: boolean = false
  ): Promise<{ chat?: Chat & { memberIds: string[] }; isNew?: boolean; error?: string }> {
    const result = await fetchAPI<{ chat: Chat & { memberIds: string[] }; isNew: boolean }>('/chats/create', {
      method: 'POST',
      body: JSON.stringify({ memberIds, isGroup, title, gameMode, isPersonalChannel })
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

  async sendMessage(chatId: string, content: string, replyToId?: string, forwardMeta?: { isForwarded: boolean; forwardedFromUsername?: string; forwardedFromChatId?: string }, audioMeta?: { audioUrl: string; audioDuration?: number | null }, fileMeta?: { fileUrl: string; fileName: string; fileSize: number; type: 'IMAGE' | 'FILE' }, videoNoteMeta?: { videoNoteUrl: string; videoNoteDuration?: number | null }): Promise<{ message?: Message; error?: string }> {
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

  async toggleReaction(chatId: string, messageId: string, emoji: string): Promise<{ reactions?: Message['reactions']; error?: string }> {
    const result = await fetchAPI<{ reactions: Message['reactions'] }>(
      `/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/reactions`,
      {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }
    )
    if (result.data) return { reactions: result.data.reactions }
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

  async deleteConversation(chatId: string): Promise<{ success?: boolean; error?: string }> {
    const result = await fetchAPI<{ success: boolean }>(`/chats/${chatId}/members`, {
      method: 'DELETE',
    })
    if (result.data) return { success: true }
    return { error: result.error }
  },

  async kickMember(chatId: string, targetUserId: string): Promise<{ success?: boolean; error?: string }> {
    const result = await fetchAPI<{ success: boolean }>(`/chats/${chatId}/members?targetUserId=${encodeURIComponent(targetUserId)}`, {
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
export const profileAPI = {
  async updateProfile(
    username: string,
    avatarUrl?: string | null,
    bio?: string | null,
    linkedMessmeChannelId?: string | null
  ): Promise<{ user?: User; error?: string }> {
    const result = await fetchAPI<{ user: User }>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ username, avatarUrl, bio, linkedMessmeChannelId }),
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

export const storiesAPI = {
  async getFeed(): Promise<{ users?: StoryFeedItem[]; error?: string }> {
    const result = await fetchAPI<{ users: StoryFeedItem[] }>('/stories')
    if (result.data) return { users: result.data.users }
    return { error: result.error }
  },

  async getUserStories(userId: string): Promise<{ stories?: Story[]; error?: string }> {
    const result = await fetchAPI<{ stories: Story[] }>(`/stories/user/${encodeURIComponent(userId)}`)
    if (result.data) return { stories: result.data.stories }
    return { error: result.error }
  },

  async createStory(
    mediaUrl: string,
    mediaType: 'IMAGE' | 'VIDEO',
    videoDuration?: number | null
  ): Promise<{ story?: Story; error?: string }> {
    const result = await fetchAPI<{ story: Story }>('/stories', {
      method: 'POST',
      body: JSON.stringify({ mediaUrl, mediaType, videoDuration: videoDuration ?? null }),
    })
    if (result.data) return { story: result.data.story }
    return { error: result.error }
  },

  async markViewed(storyId: string): Promise<{ viewsCount?: number; error?: string }> {
    const result = await fetchAPI<{ success: boolean; viewsCount: number }>(`/stories/${encodeURIComponent(storyId)}/view`, {
      method: 'POST',
    })
    if (result.data) return { viewsCount: result.data.viewsCount }
    return { error: result.error }
  },

  async toggleLike(storyId: string): Promise<{ liked?: boolean; likesCount?: number; error?: string }> {
    const result = await fetchAPI<{ liked: boolean; likesCount: number }>(`/stories/${encodeURIComponent(storyId)}/like`, {
      method: 'POST',
    })
    if (result.data) return { liked: result.data.liked, likesCount: result.data.likesCount }
    return { error: result.error }
  },

  async uploadStoryMedia(file: File, videoDuration?: number | null): Promise<{ url?: string; mediaType?: 'IMAGE' | 'VIDEO'; duration?: number | null; error?: string }> {
    const token = getAuthToken()
    const form = new FormData()
    form.append('file', file, file.name)
    form.append('purpose', 'story')
    if (videoDuration !== undefined && videoDuration !== null) form.append('duration', String(videoDuration))
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      const data = await response.json()
      if (!response.ok) return { error: data.error }
      return { url: data.url, mediaType: data.mediaType, duration: data.duration }
    } catch {
      return { error: 'Ошибка загрузки' }
    }
  },
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
  replyToId?: string | null
  replyTo?: {
    id: string
    senderId: string
    senderUsername: string
    content: string
  } | null
  createdAt: string
}

export interface GameRoomRole {
  id: string
  chatId: string
  name: string
  color: string
  position: number
  isDefault: boolean
  permissions: {
    canMoveMembers: boolean
    canChangeAvatar: boolean
    canRenameChannels: boolean
  }
  members: Array<{ id: string; username: string; avatarUrl?: string | null }>
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

  async sendMessage(chatId: string, channelId: string, content: string, replyToId?: string | null): Promise<{ message?: ChannelMessage; error?: string }> {
    const result = await fetchAPI<{ message: ChannelMessage }>(`/chats/${chatId}/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, ...(replyToId ? { replyToId } : {}) }),
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

export const gameRolesAPI = {
  async getRoles(chatId: string): Promise<{ roles?: GameRoomRole[]; error?: string }> {
    const result = await fetchAPI<{ roles: GameRoomRole[] }>(`/chats/${chatId}/roles`)
    if (result.data) return { roles: result.data.roles }
    return { error: result.error }
  },
  async createRole(chatId: string, payload: { name: string; color?: string; permissions?: Partial<GameRoomRole['permissions']> }) {
    const result = await fetchAPI<{ role: unknown }>(`/chats/${chatId}/roles`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (result.data) return { role: result.data.role }
    return { error: result.error }
  },
  async updateRole(chatId: string, roleId: string, payload: { name?: string; color?: string; permissions?: Partial<GameRoomRole['permissions']> }) {
    const result = await fetchAPI<{ role: unknown }>(`/chats/${chatId}/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    if (result.data) return { role: result.data.role }
    return { error: result.error }
  },
  async deleteRole(chatId: string, roleId: string) {
    const result = await fetchAPI<{ success: boolean }>(`/chats/${chatId}/roles/${roleId}`, {
      method: 'DELETE',
    })
    if (result.data) return { success: true }
    return { error: result.error }
  },
  async assignMember(chatId: string, roleId: string, userId: string) {
    const result = await fetchAPI<{ member: { id: string } }>(`/chats/${chatId}/roles/${roleId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    })
    if (result.data) return { member: result.data.member }
    return { error: result.error }
  },
  async unassignMember(chatId: string, roleId: string, userId: string) {
    const result = await fetchAPI<{ success: boolean }>(`/chats/${chatId}/roles/${roleId}/members?userId=${userId}`, {
      method: 'DELETE',
    })
    if (result.data) return { success: true }
    return { error: result.error }
  },
}

export const clipMeAPI = {
  async getFeed(limit = 20): Promise<{ videos?: ClipMeVideo[]; error?: string }> {
    const result = await fetchAPI<{ videos: ClipMeVideo[] }>(`/clipme/feed?limit=${Math.max(1, Math.min(50, limit))}`)
    if (result.data) return { videos: result.data.videos }
    return { error: result.error }
  },
  async uploadClipVideo(
    file: File,
    videoDuration?: number | null,
    onProgress?: (percent: number) => void
  ): Promise<{ url?: string; duration?: number | null; error?: string }> {
    const toPercent = (loaded: number, total: number) =>
      Math.max(0, Math.min(100, Math.round((loaded / total) * 100)))
    const token = getAuthToken()
    const form = new FormData()
    form.append('file', file, file.name)
    form.append('purpose', 'clipme')
    if (videoDuration !== undefined && videoDuration !== null) form.append('duration', String(videoDuration))
    return await new Promise((resolve) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/upload')
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.upload.onprogress = (event) => {
        if (!onProgress || !event.lengthComputable) return
        const percent = toPercent(event.loaded, event.total)
        onProgress(percent)
      }
      xhr.onerror = () => resolve({ error: 'Ошибка загрузки видео' })
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText || '{}')
          if (xhr.status < 200 || xhr.status >= 300) {
            resolve({ error: data.error ?? 'Ошибка загрузки видео' })
            return
          }
          onProgress?.(100)
          resolve({ url: data.url, duration: data.duration })
        } catch {
          resolve({ error: 'Ошибка загрузки видео' })
        }
      }
      xhr.send(form)
    })
  },
  async createVideo(videoUrl: string, description: string, privacy: ClipMePrivacy): Promise<{ video?: ClipMeVideo; error?: string }> {
    const result = await fetchAPI<{ video: ClipMeVideo }>('/clipme/videos', {
      method: 'POST',
      body: JSON.stringify({ videoUrl, description, privacy }),
    })
    if (result.data) return { video: result.data.video }
    return { error: result.error }
  },
  async getVideoById(videoId: string): Promise<{ video?: ClipMeVideo; error?: string; status?: number }> {
    const result = await fetchAPI<{ video: ClipMeVideo }>(`/clipme/videos/${encodeURIComponent(videoId)}`)
    if (result.data) return { video: result.data.video, status: result.status }
    return { error: result.error, status: result.status }
  },
  async registerView(
    videoId: string,
    payload?: { watchedMs?: number; completed?: boolean }
  ): Promise<{ viewed?: boolean; viewsCount?: number; error?: string }> {
    const result = await fetchAPI<{ viewed: boolean; viewsCount: number }>(`/clipme/videos/${encodeURIComponent(videoId)}/view`, {
      method: 'POST',
      body: JSON.stringify({
        watchedMs: payload?.watchedMs ?? 0,
        completed: payload?.completed ?? false,
      }),
    })
    if (result.data) return { viewed: result.data.viewed, viewsCount: result.data.viewsCount }
    return { error: result.error }
  },
  async toggleLike(videoId: string): Promise<{ liked?: boolean; likesCount?: number; error?: string }> {
    const result = await fetchAPI<{ liked: boolean; likesCount: number }>(`/clipme/videos/${encodeURIComponent(videoId)}/like`, { method: 'POST' })
    if (result.data) return { liked: result.data.liked, likesCount: result.data.likesCount }
    return { error: result.error }
  },
  async toggleRepost(videoId: string): Promise<{ reposted?: boolean; repostsCount?: number; error?: string }> {
    const result = await fetchAPI<{ reposted: boolean; repostsCount: number }>(`/clipme/videos/${encodeURIComponent(videoId)}/repost`, { method: 'POST' })
    if (result.data) return { reposted: result.data.reposted, repostsCount: result.data.repostsCount }
    return { error: result.error }
  },
  async getComments(videoId: string): Promise<{ comments?: ClipMeComment[]; error?: string }> {
    const result = await fetchAPI<{ comments: ClipMeComment[] }>(`/clipme/videos/${encodeURIComponent(videoId)}/comments`)
    if (result.data) return { comments: result.data.comments }
    return { error: result.error }
  },
  async addComment(videoId: string, content: string, parentId?: string | null): Promise<{ comment?: ClipMeComment; commentsCount?: number; error?: string }> {
    const result = await fetchAPI<{ comment: ClipMeComment; commentsCount: number }>(`/clipme/videos/${encodeURIComponent(videoId)}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content, parentId: parentId ?? null }),
    })
    if (result.data) return { comment: result.data.comment, commentsCount: result.data.commentsCount }
    return { error: result.error }
  },
  async toggleCommentLike(commentId: string): Promise<{ liked?: boolean; likesCount?: number; error?: string }> {
    const result = await fetchAPI<{ liked: boolean; likesCount: number }>(`/clipme/comments/${encodeURIComponent(commentId)}/like`, { method: 'POST' })
    if (result.data) return { liked: result.data.liked, likesCount: result.data.likesCount }
    return { error: result.error }
  },
  async updatePrivacy(videoId: string, privacy: ClipMePrivacy): Promise<{ privacy?: ClipMePrivacy; error?: string }> {
    const result = await fetchAPI<{ video: { id: string; privacy: ClipMePrivacy } }>(`/clipme/videos/${encodeURIComponent(videoId)}/privacy`, {
      method: 'PATCH',
      body: JSON.stringify({ privacy }),
    })
    if (result.data) return { privacy: result.data.video.privacy }
    return { error: result.error }
  },
  async getUserChannel(userId: string): Promise<{
    user?: Pick<User, 'id' | 'username' | 'avatarUrl' | 'clipMeBio' | 'linkedMessmeChannelId' | 'isBadgeVerified'>
    linkedMessmeChannel?: {
      id: string
      title: string
      subscribersCount: number
      lastMessageText?: string | null
    } | null
    videos?: ClipMeVideo[]
    reposts?: ClipMeVideo[]
    followersCount?: number
    followingCount?: number
    subscribedByMe?: boolean
    error?: string
  }> {
    const result = await fetchAPI<{
      user: Pick<User, 'id' | 'username' | 'avatarUrl' | 'clipMeBio' | 'linkedMessmeChannelId' | 'isBadgeVerified'>
      linkedMessmeChannel?: {
        id: string
        title: string
        subscribersCount: number
        lastMessageText?: string | null
      } | null
      videos: ClipMeVideo[]
      reposts: ClipMeVideo[]
      followersCount: number
      followingCount: number
      subscribedByMe: boolean
    }>(`/clipme/users/${encodeURIComponent(userId)}`)
    if (result.data) {
      return {
        user: result.data.user,
        linkedMessmeChannel: result.data.linkedMessmeChannel ?? null,
        videos: result.data.videos,
        reposts: result.data.reposts,
        followersCount: result.data.followersCount,
        followingCount: result.data.followingCount,
        subscribedByMe: result.data.subscribedByMe,
      }
    }
    return { error: result.error }
  },
  async updateChannelBio(
    userId: string,
    clipMeBio: string
  ): Promise<{ user?: Pick<User, 'id' | 'username' | 'avatarUrl' | 'clipMeBio' | 'linkedMessmeChannelId' | 'isBadgeVerified'>; error?: string }> {
    const result = await fetchAPI<{ user: Pick<User, 'id' | 'username' | 'avatarUrl' | 'clipMeBio' | 'linkedMessmeChannelId' | 'isBadgeVerified'> }>(
      `/clipme/users/${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ clipMeBio }),
      }
    )
    if (result.data) return { user: result.data.user }
    return { error: result.error }
  },
  async toggleSubscribe(userId: string): Promise<{ subscribed?: boolean; followersCount?: number; error?: string }> {
    const result = await fetchAPI<{ subscribed: boolean; followersCount: number }>(`/clipme/users/${encodeURIComponent(userId)}/subscribe`, { method: 'POST' })
    if (result.data) return { subscribed: result.data.subscribed, followersCount: result.data.followersCount }
    return { error: result.error }
  },
}
