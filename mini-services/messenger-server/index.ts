import { createServer } from 'http'
import { Server, Socket } from 'socket.io'

// Prevent process crash from unhandled errors — log and keep running
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason)
})

const httpServer = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200)
    res.end('ok')
  } else if (req.url?.startsWith('/active-in-chat/')) {
    // Returns the set of userIds currently connected and joined to this chat
    const chatId = req.url.slice('/active-in-chat/'.length)
    const activeUserIds: string[] = []
    socketUsers.forEach(({ userId, chatIds }) => {
      if (chatIds.includes(chatId) && !activeUserIds.includes(userId)) {
        activeUserIds.push(userId)
      }
    })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ activeUserIds }))
  } else {
    res.writeHead(404)
    res.end()
  }
})
const io = new Server(httpServer, {
  path: '/ws',
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// Types
interface User {
  id: string
  username: string
  email: string
  publicKey?: string
}

interface ChatRoom {
  id: string
  title?: string
  isGroup: boolean
  members: Set<string>
}

interface Message {
  id: string
  chatId: string
  senderId: string
  senderUsername: string
  encryptedContent: string
  createdAt: string // ISO string for proper serialization
}

interface ChatNotification {
  id: string
  title: string
  isGroup: boolean
  members: Array<{ id: string; username: string; publicKey?: string }>
}

// In-memory storage (in production, use database)
const users = new Map<string, User>()
const userSockets = new Map<string, Set<string>>() // userId -> Set of socketIds
const chatRooms = new Map<string, ChatRoom>()
const messages = new Map<string, Message[]>() // chatId -> messages

// Voice channel rooms: channelId -> Map<userId, { username, avatarUrl? }>
const voiceChannelMembers = new Map<string, Map<string, { username: string; avatarUrl?: string | null }>>() // channelId -> Map<userId, info>
const channelChatMap = new Map<string, string>() // channelId -> chatId

// Connected sockets with their user info
const socketUsers = new Map<string, { userId: string, chatIds: string[] }>()

const generateId = () => Math.random().toString(36).substr(2, 9) + Date.now().toString(36)

// Helper functions
const getUserSockets = (userId: string): Socket[] => {
  const socketIds = userSockets.get(userId)
  if (!socketIds) return []
  return Array.from(socketIds)
    .map(id => io.sockets.sockets.get(id))
    .filter((s): s is Socket => s !== undefined)
}

const broadcastToChat = (chatId: string, event: string, data: unknown, excludeSocketId?: string) => {
  const room = chatRooms.get(chatId)
  if (!room) return

  room.members.forEach(memberId => {
    const sockets = getUserSockets(memberId)
    sockets.forEach(socket => {
      if (socket.id !== excludeSocketId) {
        socket.emit(event, data)
      }
    })
  })
}

// Send notification to specific user
const notifyUser = (userId: string, event: string, data: unknown) => {
  const sockets = getUserSockets(userId)
  sockets.forEach(socket => {
    socket.emit(event, data)
  })
}

// Socket event handlers
io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`)

  // Test handler
  socket.on('test', (data) => {
    console.log('[WS] Test message received:', data)
    socket.emit('test-response', {
      message: 'Server received test message',
      data: data,
      timestamp: new Date().toISOString()
    })
  })

  // User authentication
  socket.on('auth', (data: { user: User }) => {
    const { user } = data
    console.log(`[WS] User authenticating: ${user.username} (${user.id})`)

    // Store user data
    users.set(user.id, user)

    // Track socket for user
    if (!userSockets.has(user.id)) {
      userSockets.set(user.id, new Set())
    }
    userSockets.get(user.id)!.add(socket.id)

    // Track socket user
    socketUsers.set(socket.id, { userId: user.id, chatIds: [] })

    socket.emit('auth-success', { userId: user.id })
    console.log(`[WS] User authenticated: ${user.username}`)
  })

  // New chat created - notify all members except the creator
  socket.on('chat-created', (data: { chat: ChatNotification, memberIds: string[] }) => {
    const { chat, memberIds } = data
    console.log(`[WS] New chat created: ${chat.id}, notifying ${memberIds.length} members`)

    // Create room in memory
    const room: ChatRoom = {
      id: chat.id,
      title: chat.title,
      isGroup: chat.isGroup,
      members: new Set(memberIds)
    }
    chatRooms.set(chat.id, room)

    // Figure out who created the chat (the socket that sent this event)
    const senderInfo = socketUsers.get(socket.id)
    const senderUserId = senderInfo?.userId

    // Notify all members EXCEPT the creator (they already added it locally)
    memberIds.forEach(memberId => {
      if (memberId !== senderUserId) {
        notifyUser(memberId, 'new-chat', { chat })
      }
    })
  })

  // Join chat room
  socket.on('join-chat', (data: { chatId: string, userId: string }) => {
    const { chatId, userId } = data
    console.log(`[WS] User ${userId} joining chat ${chatId}`)

    // Get or create chat room
    let room = chatRooms.get(chatId)
    if (!room) {
      room = {
        id: chatId,
        isGroup: false,
        members: new Set()
      }
      chatRooms.set(chatId, room)
    }

    // Add user to room
    room.members.add(userId)

    // Update socket tracking
    const socketUser = socketUsers.get(socket.id)
    if (socketUser) {
      if (!socketUser.chatIds.includes(chatId)) {
        socketUser.chatIds.push(chatId)
      }
    }

    // Send chat history
    const chatMessages = messages.get(chatId) || []
    socket.emit('chat-history', {
      chatId,
      messages: chatMessages.slice(-100) // Last 100 messages
    })

    console.log(`[WS] User joined chat ${chatId}, members: ${room.members.size}`)
  })

  // Leave chat room
  socket.on('leave-chat', (data: { chatId: string, userId: string }) => {
    const { chatId, userId } = data
    console.log(`[WS] User ${userId} leaving chat ${chatId}`)

    const room = chatRooms.get(chatId)
    if (room) {
      room.members.delete(userId)
    }

    const socketUser = socketUsers.get(socket.id)
    if (socketUser) {
      socketUser.chatIds = socketUser.chatIds.filter(id => id !== chatId)
    }
  })

  // Broadcast a pre-saved message (with real db id) to all chat members
  socket.on('broadcast-message', (message: Message) => {
    const sender = users.get(message.senderId)
    console.log(`[WS] Broadcasting message ${message.id} in chat ${message.chatId}`)
    broadcastToChat(message.chatId, 'new-message', message)
  })

  // Delete message — broadcast to all chat members
  socket.on('delete-message', (data: { chatId: string; messageId: string }) => {
    const { chatId, messageId } = data
    console.log(`[WS] Message deleted: ${messageId} in chat ${chatId}`)
    broadcastToChat(chatId, 'message-deleted', { chatId, messageId })
  })

  // Edit message — broadcast updated message to all chat members
  socket.on('edit-message', (message: Message) => {
    console.log(`[WS] Message edited: ${message.id} in chat ${message.chatId}`)
    broadcastToChat(message.chatId, 'message-edited', message)
  })

  // Pin/unpin message — broadcast updated pin state to all chat members
  socket.on('pin-updated', (data: { chatId: string; pinnedMessage: { id: string; content: string; senderUsername: string | null; createdAt: string } | null }) => {
    const { chatId } = data
    console.log(`[WS] Pin updated in chat ${chatId}`)
    broadcastToChat(chatId, 'pin-updated', data)
  })

  // Send message (legacy — keep for compatibility but prefer broadcast-message)
  socket.on('send-message', (data: {
    chatId: string,
    senderId: string,
    encryptedContent: string
  }) => {
    const { chatId, senderId, encryptedContent } = data
    const sender = users.get(senderId)

    if (!sender) {
      console.error(`[WS] Sender not found: ${senderId}`)
      return
    }

    const message: Message = {
      id: generateId(),
      chatId,
      senderId,
      senderUsername: sender.username,
      encryptedContent,
      createdAt: new Date().toISOString() // Use ISO string
    }

    // Store message
    if (!messages.has(chatId)) {
      messages.set(chatId, [])
    }
    messages.get(chatId)!.push(message)

    // Broadcast to all chat members
    broadcastToChat(chatId, 'new-message', message)

    console.log(`[WS] Message sent in chat ${chatId} by ${sender.username}`)
  })

  // Typing indicator
  socket.on('typing', (data: { chatId: string, userId: string, isTyping: boolean }) => {
    const { chatId, userId, isTyping } = data
    const user = users.get(userId)

    if (user) {
      broadcastToChat(chatId, 'user-typing', {
        chatId,
        userId,
        username: user.username,
        isTyping
      }, socket.id)
    }
  })

  // Get online users
  socket.on('get-online-users', (data: { chatId: string }) => {
    const { chatId } = data
    const room = chatRooms.get(chatId)

    if (room) {
      const onlineUsers = Array.from(room.members)
        .filter(userId => users.has(userId))
        .map(userId => {
          const user = users.get(userId)!
          return {
            id: user.id,
            username: user.username,
            isOnline: true
          }
        })

      socket.emit('online-users', { chatId, users: onlineUsers })
    }
  })

  // Members added to group
  socket.on('members-added', (data: { chatId: string; members: User[]; memberIds: string[] }) => {
    const { chatId, members, memberIds } = data
    console.log(`[WS] Members added to chat ${chatId}: ${memberIds.length} users`)

    // Add members to room
    const room = chatRooms.get(chatId)
    if (room) {
      memberIds.forEach(memberId => {
        room.members.add(memberId)
      })
    }

    // Notify new members about the chat
    members.forEach(member => {
      notifyUser(member.id, 'new-chat', {
        chat: {
          id: chatId,
          title: room?.title || 'Группа',
          isGroup: true,
          members: members
        }
      })
    })

    // Notify existing members about new participants
    broadcastToChat(chatId, 'members-added', { chatId, members }, socket.id)
  })

  // ── WebRTC Signaling ─────────────────────────────────────────────────────

  // Caller sends offer to callee
  socket.on('call-offer', (data: { chatId: string; calleeId: string; callerId: string; callerName: string; offer: RTCSessionDescriptionInit; withVideo: boolean }) => {
    console.log(`[WS] Call offer from ${data.callerId} to ${data.calleeId}`)
    notifyUser(data.calleeId, 'call-incoming', data)
  })

  // Callee accepts and sends answer
  socket.on('call-answer', (data: { chatId: string; callerId: string; answer: RTCSessionDescriptionInit }) => {
    console.log(`[WS] Call answered for chat ${data.chatId}`)
    notifyUser(data.callerId, 'call-answered', data)
    // Dismiss incoming call dialog on callee's other devices (same user, other sockets)
    const calleeId = socketUsers.get(socket.id)?.userId
    if (calleeId) {
      const calleeSockets = getUserSockets(calleeId)
      calleeSockets.forEach(s => {
        if (s.id !== socket.id) {
          s.emit('call-ended', { chatId: data.chatId })
        }
      })
    }
  })

  // ICE candidate exchange
  socket.on('call-ice-candidate', (data: { targetUserId: string; candidate: RTCIceCandidateInit }) => {
    notifyUser(data.targetUserId, 'call-ice-candidate', data)
  })

  // Either side ends the call
  socket.on('call-end', (data: { chatId: string; targetUserId: string }) => {
    console.log(`[WS] Call ended in chat ${data.chatId}`)
    notifyUser(data.targetUserId, 'call-ended', { chatId: data.chatId })
  })

  // Callee rejects incoming call
  socket.on('call-reject', (data: { chatId: string; callerId: string }) => {
    console.log(`[WS] Call rejected in chat ${data.chatId}`)
    notifyUser(data.callerId, 'call-rejected', { chatId: data.chatId })
  })

  // ── Voice Channels (Game Mode) ────────────────────────────────────────────

  socket.on('vc-join', (data: { channelId: string; chatId: string; userId: string; username: string; avatarUrl?: string | null }) => {
    const { channelId, chatId, userId, username, avatarUrl } = data
    console.log(`[WS] User ${username} joining voice channel ${channelId}`)

    // Remove user from any previous voice channels to prevent duplicate presence after reconnect/restore.
    voiceChannelMembers.forEach((members, existingChannelId) => {
      if (!members.has(userId)) return
      if (existingChannelId === channelId) return
      members.delete(userId)
      const existingChatId = channelChatMap.get(existingChannelId)
      if (existingChatId) {
        broadcastToChat(existingChatId, 'voice-channel-left', { channelId: existingChannelId, userId })
      }
      if (members.size === 0) {
        voiceChannelMembers.delete(existingChannelId)
        channelChatMap.delete(existingChannelId)
      }
    })

    channelChatMap.set(channelId, chatId)

    if (!voiceChannelMembers.has(channelId)) {
      voiceChannelMembers.set(channelId, new Map())
    }
    const members = voiceChannelMembers.get(channelId)!

    // Tell existing members about the newcomer (for WebRTC signaling)
    // Broadcasting to the whole chat room covers both voice members and sidebar observers
    broadcastToChat(chatId, 'voice-channel-joined', { channelId, userId, username, avatarUrl }, socket.id)

    // Tell the newcomer about all existing members (for offer creation)
    const memberList = Array.from(members.entries()).map(([uid, info]) => ({ userId: uid, username: info.username, avatarUrl: info.avatarUrl }))
    notifyUser(userId, 'voice-channel-members', { channelId, members: memberList })

    members.set(userId, { username, avatarUrl })
  })

  socket.on('vc-leave', (data: { channelId: string; userId: string }) => {
    const { channelId, userId } = data
    const members = voiceChannelMembers.get(channelId)
    if (members) {
      members.delete(userId)
      if (members.size === 0) {
        voiceChannelMembers.delete(channelId)
        channelChatMap.delete(channelId)
      }
    }
    // Notify ALL chat members so they can update sidebar occupant lists
    const chatId = channelChatMap.get(channelId)
    if (chatId) {
      broadcastToChat(chatId, 'voice-channel-left', { channelId, userId })
    } else {
      // Fallback: notify remaining voice members
      const room = voiceChannelMembers.get(channelId)
      if (room) room.forEach((_info, uid) => notifyUser(uid, 'voice-channel-left', { channelId, userId }))
    }
    console.log(`[WS] User ${userId} left voice channel ${channelId}`)
  })

  // ── Request current voice channel occupants ───────────────────────────────
  socket.on('vc-get-occupants', (data: { channelIds: string[] }) => {
    const result: Record<string, Array<{ userId: string; username: string; avatarUrl?: string | null }>> = {}
    data.channelIds.forEach(channelId => {
      const members = voiceChannelMembers.get(channelId)
      result[channelId] = members
        ? Array.from(members.entries()).map(([uid, info]) => ({ userId: uid, username: info.username, avatarUrl: info.avatarUrl }))
        : []
    })
    socket.emit('vc-occupants', result)
  })

  socket.on('vc-offer', (data: { channelId: string; toUserId: string; offer: RTCSessionDescriptionInit }) => {
    const fromUserId = socketUsers.get(socket.id)?.userId
    if (!fromUserId) return
    notifyUser(data.toUserId, 'vc-offer', { channelId: data.channelId, fromUserId, offer: data.offer })
  })

  socket.on('vc-answer', (data: { channelId: string; toUserId: string; answer: RTCSessionDescriptionInit }) => {
    const fromUserId = socketUsers.get(socket.id)?.userId
    if (!fromUserId) return
    notifyUser(data.toUserId, 'vc-answer', { channelId: data.channelId, fromUserId, answer: data.answer })
  })

  socket.on('vc-ice', (data: { channelId: string; toUserId: string; candidate: RTCIceCandidateInit }) => {
    const fromUserId = socketUsers.get(socket.id)?.userId
    if (!fromUserId) return
    notifyUser(data.toUserId, 'vc-ice', { channelId: data.channelId, fromUserId, candidate: data.candidate })
  })

  socket.on('vc-screen-start', (data: { channelId: string }) => {
    const fromUserId = socketUsers.get(socket.id)?.userId
    if (!fromUserId) return
    const members = voiceChannelMembers.get(data.channelId)
    if (!members) return
    members.forEach((_info, uid) => {
      if (uid !== fromUserId) notifyUser(uid, 'vc-screen-start', { channelId: data.channelId, userId: fromUserId })
    })
  })

  socket.on('vc-screen-stop', (data: { channelId: string }) => {
    const fromUserId = socketUsers.get(socket.id)?.userId
    if (!fromUserId) return
    const members = voiceChannelMembers.get(data.channelId)
    if (!members) return
    members.forEach((_info, uid) => {
      if (uid !== fromUserId) notifyUser(uid, 'vc-screen-stop', { channelId: data.channelId, userId: fromUserId })
    })
  })

  socket.on('broadcast-channel-message', (data: { channelId: string; message: unknown }) => {
    socket.broadcast.emit('channel-message', data)
  })

  socket.on('vc-ping', (_data: unknown, ack: (() => void) | undefined) => {
    if (typeof ack === 'function') ack()
  })

  socket.on('vc-move-member', (data: { chatId: string; channelId: string; targetUserId: string }) => {
    const movedByUserId = socketUsers.get(socket.id)?.userId
    if (!movedByUserId) return
    const targetSockets = getUserSockets(data.targetUserId)
    targetSockets.forEach(s => {
      s.emit('vc-force-move', { chatId: data.chatId, channelId: data.channelId, movedByUserId })
    })
  })

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const socketUser = socketUsers.get(socket.id)
    console.log(`[WS] Client disconnected: ${socket.id}`)

    if (socketUser) {
      const { userId, chatIds } = socketUser

      // Remove socket from user's sockets
      const userSocketSet = userSockets.get(userId)
      if (userSocketSet) {
        userSocketSet.delete(socket.id)
        if (userSocketSet.size === 0) {
          userSockets.delete(userId)
          users.delete(userId)

          // Clean up voice channel memberships
          voiceChannelMembers.forEach((members, channelId) => {
            if (members.has(userId)) {
              members.delete(userId)
              const chatId = channelChatMap.get(channelId)
              if (chatId) {
                broadcastToChat(chatId, 'voice-channel-left', { channelId, userId })
              } else {
                members.forEach((_info, uid) => {
                  notifyUser(uid, 'voice-channel-left', { channelId, userId })
                })
              }
              if (members.size === 0) {
                voiceChannelMembers.delete(channelId)
                channelChatMap.delete(channelId)
              }
            }
          })

          // Notify all chats about user going offline
          chatIds.forEach(chatId => {
            broadcastToChat(chatId, 'user-offline', {
              chatId,
              userId,
              timestamp: new Date().toISOString()
            })
          })
        }
      }

      socketUsers.delete(socket.id)
    }
  })

  // Error handling
  socket.on('error', (error) => {
    console.error(`[WS] Socket error (${socket.id}):`, error)
  })
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`[WS] Messenger WebSocket server running on port ${PORT}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[WS] Received SIGTERM signal, shutting down...')
  httpServer.close(() => {
    console.log('[WS] Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('[WS] Received SIGINT signal, shutting down...')
  httpServer.close(() => {
    console.log('[WS] Server closed')
    process.exit(0)
  })
})
