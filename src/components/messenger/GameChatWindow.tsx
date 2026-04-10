'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  channelsAPI, chatsAPI, usersAPI, profileAPI,
  type Channel, type ChannelMessage, type Chat, type User,
} from '@/lib/api'
import { useMessengerStore } from '@/lib/store'
import { messengerSocket } from '@/lib/socket'
import {
  ArrowLeft, Hash, Volume2, Plus, Trash2, Send, Loader2,
  Mic, MicOff, PhoneOff, Gamepad2, X, Pencil, Check,
  Headphones, EarOff, UserPlus, Camera,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface GameChatWindowProps {
  chat: Chat
  onBack?: () => void
}

interface VoicePeer {
  userId: string
  username: string
  avatarUrl?: string | null
  stream?: MediaStream
}

interface PersistedVoice {
  chatId: string
  channel: Channel
  stream: MediaStream
  pcs: Map<string, RTCPeerConnection>
  audioEls: Map<string, HTMLAudioElement>
  peers: VoicePeer[]
  isMuted: boolean
  isDeafened: boolean
}

// Module-level: survives component unmounts (user switching between chats)
let _persistedVoice: PersistedVoice | null = null

export function GameChatWindow({ chat, onBack }: GameChatWindowProps) {
  const { user, updateChatMembers, updateChat } = useMessengerStore()

  // ── Channels ──────────────────────────────────────────────────────────────
  const [channels, setChannels] = useState<Channel[]>([])
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [isLoadingChannels, setIsLoadingChannels] = useState(true)

  // ── Text messages ─────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // context menu
  const [ctxMenu, setCtxMenu] = useState<{ msg: ChannelMessage; x: number; y: number } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  // ── Create/rename channel ─────────────────────────────────────────────────
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelType, setNewChannelType] = useState<'TEXT' | 'VOICE'>('TEXT')
  const [isCreatingChannel, setIsCreatingChannel] = useState(false)
  const [renamingChannelId, setRenamingChannelId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  // ── Voice ─────────────────────────────────────────────────────────────────
  const [activeVoiceChannel, setActiveVoiceChannel] = useState<Channel | null>(null)
  const [voicePeers, setVoicePeers] = useState<VoicePeer[]>([])
  const [isMicMuted, setIsMicMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const [isJoiningVoice, setIsJoiningVoice] = useState(false)
  const [ping, setPing] = useState<number | null>(null)
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set())
  const [userVolumes, setUserVolumes] = useState<Record<string, number>>({})
  const [userVolumeMenu, setUserVolumeMenu] = useState<{
    userId: string; username: string; x: number; y: number
  } | null>(null)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map())
  const audioElements = useRef<Map<string, HTMLAudioElement>>(new Map())
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserNodes = useRef<Map<string, AnalyserNode>>(new Map())
  const userVolumesRef = useRef<Record<string, number>>({})
  // Refs mirroring state for use in cleanup / callbacks
  const activeVoiceChannelRef = useRef<Channel | null>(null)
  const voicePeersRef = useRef<VoicePeer[]>([])
  const isMicMutedRef = useRef(false)
  const isDeafenedRef = useRef(false)

  // ── Members panel ─────────────────────────────────────────────────────────
  const [showMembers, setShowMembers] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [memberSearchResults, setMemberSearchResults] = useState<User[]>([])
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([])
  const [isAddingMembers, setIsAddingMembers] = useState(false)

  // ── Avatar upload ─────────────────────────────────────────────────────────
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const avatarFileInputRef = useRef<HTMLInputElement>(null)

  // ── Ref sync (for stable access in cleanup / callbacks) ───────────────────
  useEffect(() => { activeVoiceChannelRef.current = activeVoiceChannel }, [activeVoiceChannel])
  useEffect(() => { voicePeersRef.current = voicePeers }, [voicePeers])
  useEffect(() => { isMicMutedRef.current = isMicMuted }, [isMicMuted])
  useEffect(() => { isDeafenedRef.current = isDeafened }, [isDeafened])
  useEffect(() => { userVolumesRef.current = userVolumes }, [userVolumes])

  // ── Voice Activity Detection ──────────────────────────────────────────────
  const setupAnalyser = useCallback((userId: string, stream: MediaStream) => {
    if (analyserNodes.current.has(userId)) return
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    try {
      const analyser = audioCtxRef.current.createAnalyser()
      analyser.fftSize = 256
      audioCtxRef.current.createMediaStreamSource(stream).connect(analyser)
      analyserNodes.current.set(userId, analyser)
    } catch {}
  }, [])

  useEffect(() => {
    if (!activeVoiceChannel) { setSpeakingUsers(new Set()); return }
    const buf = new Uint8Array(64)
    const id = setInterval(() => {
      const next = new Set<string>()
      analyserNodes.current.forEach((an, uid) => {
        an.getByteFrequencyData(buf)
        if (buf.reduce((s, v) => s + v, 0) / buf.length > 10) next.add(uid)
      })
      setSpeakingUsers(prev => {
        if (prev.size === next.size && [...prev].every(id => next.has(id))) return prev
        return next
      })
    }, 100)
    return () => clearInterval(id)
  }, [activeVoiceChannel?.id])

  // ── Restore persisted voice on mount ─────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (_persistedVoice?.chatId === chat.id && user) {
      const v = _persistedVoice
      localStreamRef.current = v.stream
      peerConnections.current = v.pcs
      audioElements.current = v.audioEls
      setupAnalyser(user.id, v.stream)
      for (const peer of v.peers) {
        if (peer.stream) setupAnalyser(peer.userId, peer.stream)
      }
      v.audioEls.forEach(el => { el.volume = v.isDeafened ? 0 : 1 })
      setActiveVoiceChannel(v.channel)
      setVoicePeers([...v.peers])
      setIsMicMuted(v.isMuted)
      setIsDeafened(v.isDeafened)
      pingIntervalRef.current = setInterval(async () => {
        const ms = await messengerSocket.measurePing()
        setPing(ms)
      }, 3000)
      messengerSocket.measurePing().then(setPing)
    }
  }, []) // intentionally only runs on mount

  // ── Persist voice on unmount (chat switch) ────────────────────────────────
  useEffect(() => {
    return () => {
      if (activeVoiceChannelRef.current && localStreamRef.current) {
        _persistedVoice = {
          chatId: chat.id,
          channel: activeVoiceChannelRef.current,
          stream: localStreamRef.current,
          pcs: peerConnections.current,
          audioEls: audioElements.current,
          peers: voicePeersRef.current,
          isMuted: isMicMutedRef.current,
          isDeafened: isDeafenedRef.current,
        }
      }
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
    }
  }, [chat.id])

  // ── Member search ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!memberSearch.trim()) { setMemberSearchResults([]); return }
    const t = setTimeout(async () => {
      const r = await usersAPI.search(memberSearch)
      if (r.users) {
        const ids = new Set(chat.members.map(m => m.id))
        setMemberSearchResults(r.users.filter(u => !ids.has(u.id) && u.id !== user?.id))
      }
    }, 300)
    return () => clearTimeout(t)
  }, [memberSearch, chat.members, user?.id])

  // ── Load channels ─────────────────────────────────────────────────────────
  useEffect(() => {
    setIsLoadingChannels(true)
    channelsAPI.getChannels(chat.id).then(r => {
      if (r.channels) {
        setChannels(r.channels)
        const firstText = r.channels.find(c => c.type === 'TEXT')
        if (firstText) setActiveChannel(firstText)
      }
      setIsLoadingChannels(false)
    })
  }, [chat.id])

  // ── Load messages when channel changes ────────────────────────────────────
  useEffect(() => {
    if (!activeChannel || activeChannel.type !== 'TEXT') return
    setMessages([])
    setEditingId(null)
    channelsAPI.getMessages(chat.id, activeChannel.id).then(r => {
      if (r.messages) setMessages(r.messages)
    })
  }, [activeChannel?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Socket: incoming channel messages ─────────────────────────────────────
  useEffect(() => {
    const handle = (data: { channelId: string; message: ChannelMessage }) => {
      if (data.channelId !== activeChannel?.id) return
      // De-duplicate: ignore if we already have a matching real ID
      setMessages(prev => {
        if (prev.some(m => m.id === data.message.id)) return prev
        // Replace our own optimistic copy if content matches
        const tmpIdx = prev.findIndex(
          m => m.id.startsWith('tmp_') && m.senderId === data.message.senderId && m.content === data.message.content
        )
        if (tmpIdx !== -1) {
          const next = [...prev]
          next[tmpIdx] = data.message
          return next
        }
        return [...prev, data.message]
      })
    }
    messengerSocket.on('channel-message', handle)
    return () => messengerSocket.off('channel-message', handle)
  }, [activeChannel?.id])

  // ── Socket: voice events ──────────────────────────────────────────────────
  useEffect(() => {
    const onJoined = (data: { channelId: string; userId: string; username: string; avatarUrl?: string | null }) => {
      if (data.channelId !== activeVoiceChannelRef.current?.id) return
      setVoicePeers(prev => prev.find(p => p.userId === data.userId) ? prev : [...prev, { userId: data.userId, username: data.username, avatarUrl: data.avatarUrl }])
      createOffer(data.userId, data.channelId)
    }
    const onLeft = (data: { channelId: string; userId: string }) => {
      if (data.channelId !== activeVoiceChannelRef.current?.id) return
      setVoicePeers(prev => prev.filter(p => p.userId !== data.userId))
      closePeer(data.userId)
    }
    const onMembers = (data: { channelId: string; members: Array<{ userId: string; username: string; avatarUrl?: string | null }> }) => {
      if (data.channelId !== activeVoiceChannelRef.current?.id) return
      setVoicePeers(data.members.filter(m => m.userId !== user?.id))
    }
    const onOffer = async (data: { channelId: string; fromUserId: string; offer: RTCSessionDescriptionInit }) => {
      if (data.channelId !== activeVoiceChannelRef.current?.id) return
      await handleIncomingOffer(data.fromUserId, data.channelId, data.offer)
    }
    const onAnswer = async (data: { channelId: string; fromUserId: string; answer: RTCSessionDescriptionInit }) => {
      const pc = peerConnections.current.get(data.fromUserId)
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.answer))
    }
    const onIce = async (data: { channelId: string; fromUserId: string; candidate: RTCIceCandidateInit }) => {
      const pc = peerConnections.current.get(data.fromUserId)
      if (pc) { try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)) } catch {} }
    }

    messengerSocket.on('voice-channel-joined', onJoined)
    messengerSocket.on('voice-channel-left', onLeft)
    messengerSocket.on('voice-channel-members', onMembers)
    messengerSocket.on('vc-offer', onOffer)
    messengerSocket.on('vc-answer', onAnswer)
    messengerSocket.on('vc-ice', onIce)
    return () => {
      messengerSocket.off('voice-channel-joined', onJoined)
      messengerSocket.off('voice-channel-left', onLeft)
      messengerSocket.off('voice-channel-members', onMembers)
      messengerSocket.off('vc-offer', onOffer)
      messengerSocket.off('vc-answer', onAnswer)
      messengerSocket.off('vc-ice', onIce)
    }
  }, [user?.id]) // uses activeVoiceChannelRef (ref) — no state dep needed

  // ── Close context menus on click outside ─────────────────────────────────
  useEffect(() => {
    if (!ctxMenu && !userVolumeMenu) return
    const close = () => { setCtxMenu(null); setUserVolumeMenu(null) }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [ctxMenu, userVolumeMenu])

  // ── WebRTC ────────────────────────────────────────────────────────────────
  const createPeerConnection = useCallback((remoteUserId: string, channelId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!))
    pc.onicecandidate = e => { if (e.candidate) messengerSocket.sendVcIce(channelId, remoteUserId, e.candidate) }
    pc.ontrack = e => {
      const stream = e.streams[0]
      setVoicePeers(prev => prev.map(p => p.userId === remoteUserId ? { ...p, stream } : p))
      let el = audioElements.current.get(remoteUserId)
      if (!el) { el = new Audio(); el.autoplay = true; audioElements.current.set(remoteUserId, el) }
      el.srcObject = stream
      el.volume = isDeafenedRef.current ? 0 : Math.min(2, (userVolumesRef.current[remoteUserId] ?? 100) / 100)
      setupAnalyser(remoteUserId, stream)
    }
    peerConnections.current.set(remoteUserId, pc)
    return pc
  }, [])

  const createOffer = useCallback(async (remoteUserId: string, channelId: string) => {
    const pc = createPeerConnection(remoteUserId, channelId)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    messengerSocket.sendVcOffer(channelId, remoteUserId, offer)
  }, [createPeerConnection])

  const handleIncomingOffer = useCallback(async (remoteUserId: string, channelId: string, offer: RTCSessionDescriptionInit) => {
    const pc = createPeerConnection(remoteUserId, channelId)
    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    messengerSocket.sendVcAnswer(channelId, remoteUserId, answer)
    setVoicePeers(prev => prev.find(p => p.userId === remoteUserId) ? prev : [...prev, { userId: remoteUserId, username: remoteUserId }])
  }, [createPeerConnection])

  const closePeer = useCallback((remoteUserId: string) => {
    peerConnections.current.get(remoteUserId)?.close()
    peerConnections.current.delete(remoteUserId)
    const el = audioElements.current.get(remoteUserId)
    if (el) { el.srcObject = null; audioElements.current.delete(remoteUserId) }
    analyserNodes.current.delete(remoteUserId)
    setSpeakingUsers(prev => { const n = new Set(prev); n.delete(remoteUserId); return n })
  }, [])

  const joinVoiceChannel = async (channel: Channel) => {
    if (!user) return
    if (activeVoiceChannel) await leaveVoiceChannel()
    setIsJoiningVoice(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localStreamRef.current = stream
      setupAnalyser(user.id, stream)
      setActiveVoiceChannel(channel)
      setVoicePeers([])
      messengerSocket.joinVoiceChannel(channel.id, user.id, user.username)
      pingIntervalRef.current = setInterval(async () => {
        const ms = await messengerSocket.measurePing()
        setPing(ms)
      }, 3000)
      const ms = await messengerSocket.measurePing()
      setPing(ms)
    } catch { console.error('Microphone denied') }
    finally { setIsJoiningVoice(false) }
  }

  const leaveVoiceChannel = useCallback(async () => {
    if (!user || !activeVoiceChannelRef.current) return
    _persistedVoice = null // explicit leave
    messengerSocket.leaveVoiceChannel(activeVoiceChannelRef.current.id, user.id)
    peerConnections.current.forEach(pc => pc.close())
    peerConnections.current.clear()
    audioElements.current.forEach(el => { el.srcObject = null })
    audioElements.current.clear()
    analyserNodes.current.clear()
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null }
    setPing(null)
    setActiveVoiceChannel(null)
    setVoicePeers([])
    setSpeakingUsers(new Set())
  }, [user])

  // ── Mic / deafen toggles ────────────────────────────────────────────────────────
  const toggleMic = () => {
    if (!localStreamRef.current) return
    const newMuted = !isMicMuted
    localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !newMuted })
    setIsMicMuted(newMuted)
  }

  const toggleDeafen = () => {
    const newDeafened = !isDeafened
    if (newDeafened && !isMicMutedRef.current) {
      localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false })
      setIsMicMuted(true)
    }
    audioElements.current.forEach((el, uid) => {
      el.volume = newDeafened ? 0 : Math.min(2, (userVolumesRef.current[uid] ?? 100) / 100)
    })
    setIsDeafened(newDeafened)
  }

  // ── Members management ────────────────────────────────────────────────────────────
  const handleAddMembers = async () => {
    if (!selectedToAdd.length) return
    setIsAddingMembers(true)
    const r = await chatsAPI.addMembers(chat.id, selectedToAdd)
    if (r.newMembers) {
      updateChatMembers(chat.id, [...chat.members, ...r.newMembers])
    }
    setSelectedToAdd([])
    setMemberSearch('')
    setMemberSearchResults([])
    setShowMembers(false)
    setIsAddingMembers(false)
  }

  // ── Avatar upload ─────────────────────────────────────────────────────────────
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setIsUploadingAvatar(true)
    const uploaded = await profileAPI.uploadAvatar(file, 'group')
    if (uploaded.url) {
      await chatsAPI.updateGroupSettings(chat.id, chat.title, uploaded.url)
      updateChat(chat.id, { avatarUrl: uploaded.url })
    }
    setIsUploadingAvatar(false)
  }

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!draft.trim() || !activeChannel || activeChannel.type !== 'TEXT' || !user) return
    const content = draft.trim()
    setDraft('')
    const tmpId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const optimistic: ChannelMessage = {
      id: tmpId,
      channelId: activeChannel.id,
      senderId: user.id,
      senderUsername: user.username,
      content,
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])
    setIsSending(true)
    try {
      const r = await channelsAPI.sendMessage(chat.id, activeChannel.id, content)
      if (r.message) {
        setMessages(prev => prev.map(m => m.id === tmpId ? r.message! : m))
        messengerSocket.broadcastChannelMessage(activeChannel.id, r.message)
      } else {
        setMessages(prev => prev.filter(m => m.id !== tmpId))
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tmpId))
    } finally {
      setIsSending(false)
    }
  }

  // ── Delete message ────────────────────────────────────────────────────────
  const handleDeleteMessage = async (msg: ChannelMessage) => {
    setMessages(prev => prev.filter(m => m.id !== msg.id))
    await channelsAPI.deleteMessage(chat.id, msg.channelId, msg.id)
  }

  // ── Edit message ──────────────────────────────────────────────────────────
  const handleEditSave = async (msg: ChannelMessage) => {
    const content = editDraft.trim()
    if (!content || content === msg.content) { setEditingId(null); return }
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content } : m))
    setEditingId(null)
    await channelsAPI.editMessage(chat.id, msg.channelId, msg.id, content)
  }

  // ── Create channel ─────────────────────────────────────────────────────────
  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return
    setIsCreatingChannel(true)
    const r = await channelsAPI.createChannel(chat.id, newChannelName.trim(), newChannelType)
    if (r.channel) {
      setChannels(prev => [...prev, r.channel!])
      if (newChannelType === 'TEXT' && !channels.find(c => c.type === 'TEXT')) setActiveChannel(r.channel)
    }
    setNewChannelName('')
    setShowCreateChannel(false)
    setIsCreatingChannel(false)
  }

  // ── Delete channel ─────────────────────────────────────────────────────────
  const handleDeleteChannel = async (channelId: string) => {
    await channelsAPI.deleteChannel(chat.id, channelId)
    setChannels(prev => prev.filter(c => c.id !== channelId))
    if (activeChannel?.id === channelId) setActiveChannel(channels.find(c => c.id !== channelId && c.type === 'TEXT') ?? null)
  }

  // ── Rename channel ─────────────────────────────────────────────────────────
  const handleRenameChannel = async (channelId: string) => {
    if (!renameDraft.trim()) { setRenamingChannelId(null); return }
    const r = await channelsAPI.renameChannel(chat.id, channelId, renameDraft.trim())
    if (r.channel) {
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, name: r.channel!.name } : c))
      if (activeChannel?.id === channelId) setActiveChannel(prev => prev ? { ...prev, name: r.channel!.name } : prev)
    }
    setRenamingChannelId(null)
  }

  const textChannels = channels.filter(c => c.type === 'TEXT')
  const voiceChannels = channels.filter(c => c.type === 'VOICE')
  const isOwner = chat.ownerId === user?.id

  const formatTime = (d: string) => {
    try { return new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }
    catch { return '' }
  }
  const getInitials = (name: string) => name.slice(0, 2).toUpperCase()

  const pingColor = ping === null ? '' : ping < 80 ? 'text-green-400' : ping < 180 ? 'text-yellow-400' : 'text-red-400'

  // ── Channel row component (reused for text + voice) ───────────────────────
  const ChannelRow = ({ ch, isActive, onClick }: { ch: Channel; isActive: boolean; onClick: () => void }) => {
    const isRenaming = renamingChannelId === ch.id
    return (
      <div className="group flex items-center gap-0.5">
        {isRenaming ? (
          <form
            className="flex-1 flex items-center gap-1"
            onSubmit={e => { e.preventDefault(); handleRenameChannel(ch.id) }}
          >
            <Input
              value={renameDraft}
              onChange={e => setRenameDraft(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              onKeyDown={e => { if (e.key === 'Escape') setRenamingChannelId(null) }}
              autoFocus
              className="h-7 text-xs bg-white/[0.08] border-white/20 text-white px-2 rounded-lg flex-1"
            />
            <button type="submit" className="h-6 w-6 flex items-center justify-center rounded text-green-400 hover:bg-white/10">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => setRenamingChannelId(null)} className="h-6 w-6 flex items-center justify-center rounded text-white/40 hover:bg-white/10">
              <X className="h-3.5 w-3.5" />
            </button>
          </form>
        ) : (
          <>
            <button
              onClick={onClick}
              className={cn(
                'flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors text-left',
                isActive ? 'bg-white/[0.12] text-white' : 'text-white/50 hover:text-white/80 hover:bg-white/[0.06]'
              )}
            >
              {ch.type === 'TEXT' ? <Hash className="h-4 w-4 flex-shrink-0" /> : <Volume2 className="h-4 w-4 flex-shrink-0" />}
              <span className="truncate flex-1">{ch.name}</span>
            </button>
            {isOwner && (
              <>
                <button
                  onClick={() => { setRenamingChannelId(ch.id); setRenameDraft(ch.name) }}
                  className="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 text-white/30 hover:text-white/70 transition-all"
                  title="Переименовать"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleDeleteChannel(ch.id)}
                  className="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-all"
                  title="Удалить"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 bg-[#1a1b26] text-white overflow-hidden">

      {/* ── Left Sidebar ──────────────────────────────────────────────────── */}
      <div className="w-60 flex-shrink-0 flex flex-col bg-[#13141f] border-r border-white/[0.06] min-h-0">

        {/* Header */}
        <div className="flex items-center gap-2 px-3 h-14 border-b border-white/[0.06] flex-shrink-0">
          <button onClick={onBack} className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-white/[0.08] text-white/50 hover:text-white transition-colors flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              className="group relative flex-shrink-0"
              onClick={() => avatarFileInputRef.current?.click()}
              title="Изменить аватар группы"
            >
              <Avatar className="h-7 w-7">
                {chat.avatarUrl && <AvatarImage src={chat.avatarUrl} alt={chat.title} />}
                <AvatarFallback className="bg-[#5d6cf5] text-white text-[10px] font-bold rounded-lg">
                  {isUploadingAvatar ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gamepad2 className="h-3.5 w-3.5" />}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Camera className="h-3 w-3 text-white" />
              </div>
            </button>
            <span className="font-bold text-sm text-white truncate flex-1">{chat.title}</span>
          </div>
          <button
            onClick={() => setShowMembers(true)}
            className="h-6 w-6 flex items-center justify-center text-white/40 hover:text-white/80 flex-shrink-0 transition-colors"
            title="Участники"
          >
            <UserPlus className="h-4 w-4" />
          </button>
          <input ref={avatarFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
        </div>

        {/* Channels */}
        <div className="flex-1 min-h-0 overflow-y-auto py-4 px-2 space-y-4">

          {/* Text channels */}
          <div>
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">Текстовые</span>
              <button
                onClick={() => { setNewChannelType('TEXT'); setShowCreateChannel(true) }}
                className="h-4 w-4 text-white/40 hover:text-white/80 transition-colors"
                title="Добавить канал"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {isLoadingChannels ? <div className="text-white/30 text-xs px-2">Загрузка...</div>
              : textChannels.length === 0 ? <div className="text-white/20 text-xs px-2">Нет каналов</div>
              : textChannels.map(ch => (
                <ChannelRow key={ch.id} ch={ch} isActive={activeChannel?.id === ch.id} onClick={() => setActiveChannel(ch)} />
              ))}
          </div>

          {/* Voice channels */}
          <div>
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">Голосовые</span>
              <button
                onClick={() => { setNewChannelType('VOICE'); setShowCreateChannel(true) }}
                className="h-4 w-4 text-white/40 hover:text-white/80 transition-colors"
                title="Добавить канал"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {voiceChannels.length === 0 ? <div className="text-white/20 text-xs px-2">Нет каналов</div>
              : voiceChannels.map(ch => (
                <div key={ch.id}>
                  <ChannelRow
                    ch={ch}
                    isActive={activeChannel?.id === ch.id || activeVoiceChannel?.id === ch.id}
                    onClick={() => {
                      setActiveChannel(ch)
                      if (activeVoiceChannel?.id !== ch.id) joinVoiceChannel(ch)
                    }}
                  />
                  {/* Members in this voice channel */}
                  {activeVoiceChannel?.id === ch.id && (
                    <div className="ml-5 mt-1 space-y-0.5">
                      {/* Self */}
                      <div className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] text-[#8b97ff]">
                        <Avatar className={cn('h-5 w-5 ring-1 ring-offset-1 ring-offset-[#13141f] transition-all',
                          speakingUsers.has(user?.id ?? '') ? 'ring-green-400' : 'ring-transparent')}>
                          {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
                          <AvatarFallback className="bg-[#5d6cf5] text-white text-[8px] font-bold">{getInitials(user?.username ?? '?')}</AvatarFallback>
                        </Avatar>
                        <span className="truncate">{user?.username}</span>
                        {(isMicMuted || isDeafened) && <MicOff className="h-2.5 w-2.5 text-red-400 flex-shrink-0" />}
                      </div>
                      {voicePeers.map(p => (
                        <div
                          key={p.userId}
                          className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] text-white/50 cursor-context-menu"
                          onContextMenu={e => { e.preventDefault(); setUserVolumeMenu({ userId: p.userId, username: p.username, x: e.clientX, y: e.clientY }) }}
                        >
                          <Avatar className={cn('h-5 w-5 ring-1 ring-offset-1 ring-offset-[#13141f] transition-all',
                            speakingUsers.has(p.userId) ? 'ring-green-400' : 'ring-transparent')}>
                            {p.avatarUrl && <AvatarImage src={p.avatarUrl} />}
                            <AvatarFallback className="bg-white/10 text-white text-[8px] font-bold">{getInitials(p.username)}</AvatarFallback>
                          </Avatar>
                          <span className="truncate">{p.username}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>

        {/* Voice status bar */}
        {activeVoiceChannel && (
          <div className="border-t border-white/[0.06] p-2 bg-[#0d0e18] flex-shrink-0 space-y-1">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[#5d6cf5]/[0.12]">
              <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0 animate-pulse" />
              <span className="text-xs text-white/70 flex-1 truncate">{activeVoiceChannel.name}</span>
              <button
                onClick={toggleMic}
                className={cn('h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 transition-colors', isMicMuted ? 'text-red-400' : 'text-white/60')}
                title={isMicMuted ? 'Включить микрофон' : 'Выключить микрофон'}
              >
                {isMicMuted ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
              </button>
              <button
                onClick={toggleDeafen}
                className={cn('h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 transition-colors', isDeafened ? 'text-red-400' : 'text-white/60')}
                title={isDeafened ? 'Включить звук' : 'Выключить звук'}
              >
                {isDeafened ? <EarOff className="h-3 w-3" /> : <Headphones className="h-3 w-3" />}
              </button>
              <button onClick={leaveVoiceChannel} className="h-6 w-6 flex items-center justify-center rounded hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors">
                <PhoneOff className="h-3 w-3" />
              </button>
            </div>
            {ping !== null && (
              <div className={cn('text-[10px] px-2 font-mono', pingColor)}>
                Пинг: {ping} мс
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Main Area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">

        {/* Channel header */}
        <div className="h-14 flex items-center gap-3 px-4 border-b border-white/[0.06] flex-shrink-0 bg-[#1a1b26]">
          {activeChannel ? (
            <>
              {activeChannel.type === 'TEXT' ? <Hash className="h-5 w-5 text-white/40 flex-shrink-0" /> : <Volume2 className="h-5 w-5 text-white/40 flex-shrink-0" />}
              <span className="font-semibold text-white">{activeChannel.name}</span>
            </>
          ) : <span className="text-white/30">Выберите канал</span>}
        </div>

        {!activeChannel ? (
          <div className="flex-1 flex items-center justify-center text-white/20">
            <div className="text-center">
              <Gamepad2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Выберите канал слева</p>
            </div>
          </div>

        ) : activeChannel.type === 'VOICE' ? (
          /* ── Voice channel view ── */
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
            <Volume2 className="h-16 w-16 text-[#5d6cf5] opacity-60" />
            <div className="text-center">
              <h3 className="text-xl font-bold text-white mb-1">{activeChannel.name}</h3>
              <p className="text-white/40 text-sm">
                {activeVoiceChannel?.id === activeChannel.id
                  ? `Подключено · ${voicePeers.length + 1} участников`
                  : 'Голосовой канал'}
              </p>
            </div>

            {activeVoiceChannel?.id === activeChannel.id ? (
              <>
                {/* Participant list */}
                <div className="flex flex-col gap-2 w-full max-w-xs">
                  {/* Self */}
                  <div className={cn('flex items-center gap-3 px-4 py-2.5 rounded-xl ring-1 transition-all',
                    speakingUsers.has(user?.id ?? '') ? 'ring-green-400 bg-green-400/5' : isMicMuted ? 'ring-red-500/40 bg-red-500/5' : 'ring-[#5d6cf5]/40 bg-[#5d6cf5]/5')}>
                    <Avatar className={cn('h-10 w-10 flex-shrink-0 ring-2 ring-offset-2 ring-offset-[#1a1b26] transition-all',
                      speakingUsers.has(user?.id ?? '') ? 'ring-green-400' : 'ring-transparent')}>
                      {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
                      <AvatarFallback className="bg-[#5d6cf5] text-white font-bold">{getInitials(user?.username ?? '?')}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-white flex-1">{user?.username}</span>
                    <div className="flex items-center gap-1">
                      {isMicMuted ? <MicOff className="h-4 w-4 text-red-400 flex-shrink-0" /> : <Mic className="h-4 w-4 text-[#5d6cf5] flex-shrink-0" />}
                      {isDeafened && <EarOff className="h-4 w-4 text-red-400 flex-shrink-0" />}
                    </div>
                  </div>
                  {voicePeers.map(p => (
                    <div
                      key={p.userId}
                      className={cn('flex items-center gap-3 px-4 py-2.5 rounded-xl ring-1 cursor-context-menu transition-all',
                        speakingUsers.has(p.userId) ? 'ring-green-400 bg-green-400/5' : 'ring-white/10 bg-white/[0.04]')}
                      onContextMenu={e => { e.preventDefault(); setUserVolumeMenu({ userId: p.userId, username: p.username, x: e.clientX, y: e.clientY }) }}
                    >
                      <Avatar className={cn('h-10 w-10 flex-shrink-0 ring-2 ring-offset-2 ring-offset-[#1a1b26] transition-all',
                        speakingUsers.has(p.userId) ? 'ring-green-400' : 'ring-transparent')}>
                        {p.avatarUrl && <AvatarImage src={p.avatarUrl} />}
                        <AvatarFallback className="bg-white/10 text-white font-bold">{getInitials(p.username)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-white flex-1">{p.username}</span>
                      <Mic className="h-4 w-4 text-white/30 flex-shrink-0" />
                    </div>
                  ))}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-4 mt-2">
                  <button
                    onClick={toggleMic}
                    className={cn('h-14 w-14 rounded-full flex items-center justify-center transition-all shadow-lg',
                      isMicMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-white/[0.12] hover:bg-white/[0.20]')}
                    title={isMicMuted ? 'Включить микрофон' : 'Выключить микрофон'}
                  >
                    {isMicMuted ? <MicOff className="h-6 w-6 text-white" /> : <Mic className="h-6 w-6 text-white" />}
                  </button>
                  <button
                    onClick={toggleDeafen}
                    className={cn('h-14 w-14 rounded-full flex items-center justify-center transition-all shadow-lg',
                      isDeafened ? 'bg-red-500 hover:bg-red-600' : 'bg-white/[0.12] hover:bg-white/[0.20]')}
                    title={isDeafened ? 'Включить наушники' : 'Выключить наушники'}
                  >
                    {isDeafened ? <EarOff className="h-6 w-6 text-white" /> : <Headphones className="h-6 w-6 text-white" />}
                  </button>
                  <button
                    onClick={leaveVoiceChannel}
                    className="h-14 w-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all shadow-lg"
                  >
                    <PhoneOff className="h-6 w-6 text-white" />
                  </button>
                </div>
                {ping !== null && <span className={cn('text-xs font-mono', pingColor)}>Пинг: {ping} мс</span>}
              </>
            ) : (
              <button
                onClick={() => joinVoiceChannel(activeChannel)}
                disabled={isJoiningVoice}
                className="px-8 h-12 rounded-full bg-[#5d6cf5] hover:bg-[#4a5be0] text-white font-semibold transition-all shadow-[0_8px_24px_rgba(93,108,245,0.4)] disabled:opacity-50"
              >
                {isJoiningVoice ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'Подключиться'}
              </button>
            )}
          </div>

        ) : (
          /* ── Text channel view ── */
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-0.5" onClick={() => setCtxMenu(null)}>
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-white/20 text-sm">
                  <Hash className="h-10 w-10 mb-3 opacity-30" />
                  <p>Начало канала <strong className="text-white/30">#{activeChannel.name}</strong></p>
                </div>
              )}
              {messages.map((msg, i) => {
                const showHeader = i === 0 || messages[i - 1].senderId !== msg.senderId
                const isMine = msg.senderId === user?.id
                return (
                  <div
                    key={msg.id}
                    className={cn('flex gap-3 group relative', showHeader ? 'mt-4' : 'mt-0.5')}
                    onContextMenu={e => {
                      if (!isMine) return
                      e.preventDefault()
                      setCtxMenu({ msg, x: e.clientX, y: e.clientY })
                    }}
                  >
                    {showHeader ? (
                      <Avatar className="h-9 w-9 flex-shrink-0 mt-0.5">
                        <AvatarFallback className="bg-[#5d6cf5]/40 text-white text-xs font-bold">{getInitials(msg.senderUsername)}</AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="w-9 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      {showHeader && (
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-sm font-semibold text-white/90">{msg.senderUsername}</span>
                          <span className="text-[11px] text-white/30">{formatTime(msg.createdAt)}</span>
                        </div>
                      )}
                      {editingId === msg.id ? (
                        <form className="flex gap-2 mt-1" onSubmit={e => { e.preventDefault(); handleEditSave(msg) }}>
                          <Input
                            value={editDraft}
                            onChange={e => setEditDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') setEditingId(null) }}
                            autoFocus
                            className="flex-1 bg-white/[0.08] border-white/20 text-white text-sm h-8 rounded-lg px-2"
                          />
                          <button type="submit" className="h-8 px-3 rounded-lg bg-[#5d6cf5] text-white text-xs font-medium">Сохранить</button>
                          <button type="button" onClick={() => setEditingId(null)} className="h-8 px-3 rounded-lg bg-white/[0.08] text-white/60 text-xs">Отмена</button>
                        </form>
                      ) : (
                        <p className={cn('text-sm text-white/80 leading-relaxed break-words', msg.id.startsWith('tmp_') && 'opacity-50')}>
                          {msg.content}
                        </p>
                      )}
                    </div>

                    {/* Hover actions (own messages only) */}
                    {isMine && editingId !== msg.id && !msg.id.startsWith('tmp_') && (
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 absolute right-0 top-0 transition-opacity">
                        <button
                          onClick={() => { setEditingId(msg.id); setEditDraft(msg.content) }}
                          className="h-6 w-6 flex items-center justify-center rounded bg-[#1a1b26] hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
                          title="Редактировать"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteMessage(msg)}
                          className="h-6 w-6 flex items-center justify-center rounded bg-[#1a1b26] hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                          title="Удалить"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Context menu */}
            {ctxMenu && (
              <div
                className="fixed z-50 bg-[#1c1d2e] border border-white/[0.10] rounded-xl shadow-2xl py-1 min-w-36"
                style={{ left: ctxMenu.x, top: ctxMenu.y }}
                onClick={e => e.stopPropagation()}
              >
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/[0.08] hover:text-white transition-colors"
                  onClick={() => { setEditingId(ctxMenu.msg.id); setEditDraft(ctxMenu.msg.content); setCtxMenu(null) }}
                >
                  <Pencil className="h-3.5 w-3.5" /> Редактировать
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  onClick={() => { handleDeleteMessage(ctxMenu.msg); setCtxMenu(null) }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Удалить
                </button>
              </div>
            )}

            {/* Input */}
            <div className="flex-shrink-0 px-4 pb-4 pt-2">
              <div className="flex items-center gap-2 bg-white/[0.07] rounded-xl px-3 h-12 border border-white/[0.08]">
                <Input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder={`Сообщение в #${activeChannel.name}`}
                  disabled={isSending}
                  className="flex-1 bg-transparent border-0 text-white placeholder:text-white/30 focus-visible:ring-0 text-sm px-0 h-auto"
                />
                <button
                  onClick={handleSend}
                  disabled={!draft.trim() || isSending}
                  className="h-8 w-8 flex items-center justify-center rounded-lg bg-[#5d6cf5] hover:bg-[#4a5be0] disabled:opacity-30 transition-colors flex-shrink-0"
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Send className="h-4 w-4 text-white" />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── User Volume Context Menu ──────────────────────────────────────── */}
      {userVolumeMenu && (
        <div
          className="fixed z-50 bg-[#1c1d2e] border border-white/[0.10] rounded-xl shadow-2xl p-3 w-56"
          style={{ left: userVolumeMenu.x, top: userVolumeMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <p className="text-xs font-semibold text-white/60 mb-2 truncate">Громкость: {userVolumeMenu.username}</p>
          <div className="flex items-center gap-2">
            <Volume2 className="h-3.5 w-3.5 text-white/40 flex-shrink-0" />
            <input
              type="range" min="0" max="200"
              value={userVolumes[userVolumeMenu.userId] ?? 100}
              onChange={e => {
                const v = Number(e.target.value)
                setUserVolumes(prev => ({ ...prev, [userVolumeMenu.userId]: v }))
                const el = audioElements.current.get(userVolumeMenu.userId)
                if (el) el.volume = isDeafened ? 0 : Math.min(2, v / 100)
              }}
              className="flex-1 accent-[#5d6cf5]"
            />
            <span className="text-xs text-white/50 w-8 text-right">
              {userVolumes[userVolumeMenu.userId] ?? 100}%
            </span>
          </div>
        </div>
      )}

      {/* ── Add Members Modal ─────────────────────────────────────────────── */}
      {showMembers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowMembers(false)}>
          <div className="bg-[#1c1d2e] border border-white/[0.10] rounded-2xl w-80 p-5 shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h3 className="font-bold text-white text-base">Участники</h3>
              <button onClick={() => setShowMembers(false)} className="text-white/40 hover:text-white/80"><X className="h-5 w-5" /></button>
            </div>

            {/* Current members */}
            <div className="flex-1 min-h-0 overflow-y-auto mb-3 space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2">Сейчас ({chat.members.length})</p>
              {chat.members.map(m => (
                <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
                  <Avatar className="h-7 w-7 flex-shrink-0">
                    {m.avatarUrl && <AvatarImage src={m.avatarUrl} />}
                    <AvatarFallback className="bg-[#5d6cf5]/40 text-white text-xs font-bold">{getInitials(m.username)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-white/80 truncate">{m.username}</span>
                  {m.id === chat.ownerId && <span className="text-[10px] bg-[#5d6cf5]/30 text-[#8b97ff] px-1.5 py-0.5 rounded font-medium flex-shrink-0">Владелец</span>}
                </div>
              ))}
            </div>

            {/* Search + add */}
            <div className="flex-shrink-0 border-t border-white/[0.06] pt-3 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">Добавить</p>
              <Input
                placeholder="Поиск пользователей..."
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                className="bg-white/[0.07] border-white/[0.10] text-white placeholder:text-white/30 rounded-xl"
              />
              {memberSearchResults.length > 0 && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {memberSearchResults.map(u => {
                    const sel = selectedToAdd.includes(u.id)
                    return (
                      <button
                        key={u.id}
                        onClick={() => setSelectedToAdd(prev => sel ? prev.filter(id => id !== u.id) : [...prev, u.id])}
                        className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors',
                          sel ? 'bg-[#5d6cf5]/20 text-white' : 'hover:bg-white/[0.06] text-white/70')}
                      >
                        <Avatar className="h-6 w-6 flex-shrink-0">
                          {u.avatarUrl && <AvatarImage src={u.avatarUrl} />}
                          <AvatarFallback className="bg-white/10 text-white text-[10px] font-bold">{getInitials(u.username)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm flex-1 truncate">{u.username}</span>
                        {sel && <Check className="h-3.5 w-3.5 text-[#5d6cf5] flex-shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              )}
              {selectedToAdd.length > 0 && (
                <Button
                  onClick={handleAddMembers}
                  disabled={isAddingMembers}
                  className="w-full bg-[#5d6cf5] hover:bg-[#4a5be0] text-white"
                >
                  {isAddingMembers ? <Loader2 className="h-4 w-4 animate-spin" /> : `Добавить (${selectedToAdd.length})`}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Create Channel Modal ───────────────────────────────────────────── */}      {showCreateChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateChannel(false)}>
          <div className="bg-[#1c1d2e] border border-white/[0.10] rounded-2xl w-80 p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white text-base">Создать канал</h3>
              <button onClick={() => setShowCreateChannel(false)} className="text-white/40 hover:text-white/80"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex bg-white/[0.06] rounded-xl p-1 gap-1 mb-4">
              <button
                onClick={() => setNewChannelType('TEXT')}
                className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all font-medium',
                  newChannelType === 'TEXT' ? 'bg-white/[0.12] text-white' : 'text-white/40 hover:text-white/60')}
              >
                <Hash className="h-4 w-4" /> Текстовый
              </button>
              <button
                onClick={() => setNewChannelType('VOICE')}
                className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all font-medium',
                  newChannelType === 'VOICE' ? 'bg-white/[0.12] text-white' : 'text-white/40 hover:text-white/60')}
              >
                <Volume2 className="h-4 w-4" /> Голосовой
              </button>
            </div>
            <Input
              placeholder="название-канала"
              value={newChannelName}
              onChange={e => setNewChannelName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateChannel() }}
              autoFocus
              className="bg-white/[0.07] border-white/[0.10] text-white placeholder:text-white/30 rounded-xl mb-4"
            />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setShowCreateChannel(false)} className="flex-1 text-white/60 hover:text-white hover:bg-white/[0.08]">Отмена</Button>
              <Button
                onClick={handleCreateChannel}
                disabled={!newChannelName.trim() || isCreatingChannel}
                className="flex-1 bg-[#5d6cf5] hover:bg-[#4a5be0] text-white"
              >
                {isCreatingChannel ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Создать'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
