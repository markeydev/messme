/**
 * WebSocket Client for Messenger
 * Uses Socket.io for real-time communication
 */

import { io, Socket } from 'socket.io-client'
import type { User, Message, Chat } from './api'

export interface SocketEvents {
  'auth-success': (data: { userId: string }) => void
  'chat-history': (data: { chatId: string; messages: Message[] }) => void
  'new-message': (message: Message) => void
  'new-chat': (data: { chat: Chat }) => void
  'members-added': (data: { chatId: string; members: User[] }) => void
  'user-typing': (data: { chatId: string; userId: string; username: string; isTyping: boolean }) => void
  'user-offline': (data: { chatId: string; userId: string; timestamp: string }) => void
  'online-users': (data: { chatId: string; users: Array<{ id: string; username: string; isOnline: boolean }> }) => void
  'test-response': (data: { message: string; timestamp: string }) => void
  'message-deleted': (data: { chatId: string; messageId: string }) => void
  'message-edited': (message: Message) => void
  'disconnect': (data: Record<string, never>) => void
  // WebRTC calls
  'call-incoming': (data: { chatId: string; callerId: string; callerName: string; offer: RTCSessionDescriptionInit; withVideo: boolean }) => void
  'call-answered': (data: { chatId: string; answer: RTCSessionDescriptionInit }) => void
  'call-ice-candidate': (data: { targetUserId: string; candidate: RTCIceCandidateInit }) => void
  'call-ended': (data: { chatId: string }) => void
  'call-rejected': (data: { chatId: string }) => void
  // Voice channels (game mode)
  'voice-channel-joined': (data: { channelId: string; userId: string; username: string }) => void
  'voice-channel-left': (data: { channelId: string; userId: string }) => void
  'voice-channel-members': (data: { channelId: string; members: Array<{ userId: string; username: string }> }) => void
  'vc-offer': (data: { channelId: string; fromUserId: string; offer: RTCSessionDescriptionInit }) => void
  'vc-answer': (data: { channelId: string; fromUserId: string; answer: RTCSessionDescriptionInit }) => void
  'vc-ice': (data: { channelId: string; fromUserId: string; candidate: RTCIceCandidateInit }) => void
  'channel-message': (data: { channelId: string; message: import('./api').ChannelMessage }) => void
}

type EventCallback = (data: unknown) => void

class MessengerSocket {
  private socket: Socket | null = null
  private isConnected: boolean = false
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 10
  private listeners: Map<string, Set<EventCallback>> = new Map()
  private currentUser: User | null = null

  connect(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.socket?.connected) {
        resolve(true)
        return
      }

      // Local dev: set NEXT_PUBLIC_WS_URL=http://localhost:3003
      // Production (nginx): leave unset → same-origin /ws proxy
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? ''

      this.socket = io(wsUrl, {
        path: '/ws',
        // Start with HTTP long-polling so the connection works through mobile
        // carrier proxies that mangle WebSocket upgrade headers, then upgrade.
        transports: ['polling', 'websocket'],
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        timeout: 10000
      })

      this.socket.on('connect', () => {
        console.log('[Socket] Connected')
        this.isConnected = true
        this.reconnectAttempts = 0
        // Re-authenticate after reconnect (e.g. after sleep/wake)
        if (this.currentUser) {
          this.socket!.emit('auth', { user: this.currentUser })
        }
        resolve(true)
      })

      this.socket.on('disconnect', () => {
        console.log('[Socket] Disconnected')
        this.isConnected = false
        this.emit('disconnect', {})
      })

      this.socket.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', error)
        this.reconnectAttempts++
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          resolve(false)
        }
      })

      this.setupEventListeners()
    })
  }

  private setupEventListeners() {
    if (!this.socket) return

    const events = [
      'auth-success',
      'chat-history',
      'new-message',
      'new-chat',
      'members-added',
      'user-typing',
      'user-offline',
      'online-users',
      'test-response',
      'message-deleted',
      'message-edited',
      'call-incoming',
      'call-answered',
      'call-ice-candidate',
      'call-ended',
      'call-rejected',
      'voice-channel-joined',
      'voice-channel-left',
      'voice-channel-members',
      'vc-offer',
      'vc-answer',
      'vc-ice',
      'channel-message',
    ]

    events.forEach(event => {
      this.socket!.on(event, (data: unknown) => {
        this.emit(event, data)
      })
    })
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
      this.isConnected = false
    }
  }

  isSocketConnected(): boolean {
    return this.isConnected && this.socket?.connected === true
  }

  authenticate(user: User) {
    this.currentUser = user  // remember for reconnects
    if (this.socket) {
      this.socket.emit('auth', { user })
    }
  }

  notifyChatCreated(chat: Chat, memberIds: string[]) {
    if (this.socket) {
      this.socket.emit('chat-created', {
        chat: {
          id: chat.id,
          title: chat.title,
          isGroup: chat.isGroup,
          members: chat.members
        },
        memberIds
      })
    }
  }

  notifyMembersAdded(chatId: string, members: User[], memberIds: string[]) {
    if (this.socket) {
      this.socket.emit('members-added', { chatId, members, memberIds })
    }
  }

  joinChat(chatId: string, userId: string) {
    if (this.socket) {
      this.socket.emit('join-chat', { chatId, userId })
    }
  }

  leaveChat(chatId: string, userId: string) {
    if (this.socket) {
      this.socket.emit('leave-chat', { chatId, userId })
    }
  }

  sendMessage(chatId: string, senderId: string, encryptedContent: string) {
    if (this.socket) {
      this.socket.emit('send-message', { chatId, senderId, encryptedContent })
    }
  }

  broadcastMessage(message: import('./api').Message) {
    if (this.socket) {
      this.socket.emit('broadcast-message', message)
    }
  }

  broadcastDeleteMessage(chatId: string, messageId: string) {
    if (this.socket) {
      this.socket.emit('delete-message', { chatId, messageId })
    }
  }

  broadcastEditMessage(message: import('./api').Message) {
    if (this.socket) {
      this.socket.emit('edit-message', message)
    }
  }

  sendTyping(chatId: string, userId: string, isTyping: boolean) {
    if (this.socket) {
      this.socket.emit('typing', { chatId, userId, isTyping })
    }
  }

  getOnlineUsers(chatId: string) {
    if (this.socket) {
      this.socket.emit('get-online-users', { chatId })
    }
  }

  testConnection() {
    if (this.socket) {
      this.socket.emit('test', { timestamp: new Date().toISOString() })
    }
  }

  sendCallOffer(chatId: string, calleeId: string, callerId: string, callerName: string, offer: RTCSessionDescriptionInit, withVideo: boolean) {
    if (this.socket) {
      this.socket.emit('call-offer', { chatId, calleeId, callerId, callerName, offer, withVideo })
    }
  }

  sendCallAnswer(chatId: string, callerId: string, answer: RTCSessionDescriptionInit) {
    if (this.socket) {
      this.socket.emit('call-answer', { chatId, callerId, answer })
    }
  }

  sendCallIceCandidate(targetUserId: string, candidate: RTCIceCandidateInit) {
    if (this.socket) {
      this.socket.emit('call-ice-candidate', { targetUserId, candidate })
    }
  }

  sendCallEnd(chatId: string, targetUserId: string) {
    if (this.socket) {
      this.socket.emit('call-end', { chatId, targetUserId })
    }
  }

  sendCallReject(chatId: string, callerId: string) {
    if (this.socket) {
      this.socket.emit('call-reject', { chatId, callerId })
    }
  }

  // ── Voice channels ──────────────────────────────────────────────────────

  joinVoiceChannel(channelId: string, userId: string, username: string) {
    if (this.socket) {
      this.socket.emit('vc-join', { channelId, userId, username })
    }
  }

  leaveVoiceChannel(channelId: string, userId: string) {
    if (this.socket) {
      this.socket.emit('vc-leave', { channelId, userId })
    }
  }

  sendVcOffer(channelId: string, toUserId: string, offer: RTCSessionDescriptionInit) {
    if (this.socket) {
      this.socket.emit('vc-offer', { channelId, toUserId, offer })
    }
  }

  sendVcAnswer(channelId: string, toUserId: string, answer: RTCSessionDescriptionInit) {
    if (this.socket) {
      this.socket.emit('vc-answer', { channelId, toUserId, answer })
    }
  }

  sendVcIce(channelId: string, toUserId: string, candidate: RTCIceCandidateInit) {
    if (this.socket) {
      this.socket.emit('vc-ice', { channelId, toUserId, candidate })
    }
  }

  broadcastChannelMessage(channelId: string, message: import('./api').ChannelMessage) {
    if (this.socket) {
      this.socket.emit('broadcast-channel-message', { channelId, message })
    }
  }

  /** Measure round-trip latency via socket ack */
  measurePing(): Promise<number> {
    return new Promise(resolve => {
      if (!this.socket) return resolve(999)
      const t = Date.now()
      this.socket.emit('vc-ping', {}, () => resolve(Date.now() - t))
    })
  }

  on<K extends keyof SocketEvents>(event: K, callback: SocketEvents[K]) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback as EventCallback)
  }

  off<K extends keyof SocketEvents>(event: K, callback: SocketEvents[K]) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.delete(callback as EventCallback)
    }
  }

  private emit(event: string, data: unknown) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.forEach(callback => callback(data))
    }
  }
}

export const messengerSocket = new MessengerSocket()
