'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { messengerSocket } from '@/lib/socket'
import { useMessengerStore } from '@/lib/store'
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CallWindowProps {
  // Outgoing call props
  chatId: string
  remoteUserId: string
  remoteUsername: string
  // Who initiated?  'caller' = we called, 'callee' = we received
  role: 'caller' | 'callee'
  withVideo: boolean
  // Provided for callee: the incoming offer to answer
  incomingOffer?: RTCSessionDescriptionInit
  onClose: () => void
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  ...(process.env.NEXT_PUBLIC_TURN_URL ? [
    // UDP transport (primary)
    {
      urls: process.env.NEXT_PUBLIC_TURN_URL,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME ?? 'messme',
      credential: process.env.NEXT_PUBLIC_TURN_PASSWORD ?? '',
    },
    // TCP transport (fallback when UDP relay ports are firewalled)
    {
      urls: process.env.NEXT_PUBLIC_TURN_URL.replace(/^turn:/, 'turn:') + '?transport=tcp',
      username: process.env.NEXT_PUBLIC_TURN_USERNAME ?? 'messme',
      credential: process.env.NEXT_PUBLIC_TURN_PASSWORD ?? '',
    },
  ] : []),
]

// Use 'relay' only if TURN is configured, but still allow direct P2P as last resort
const PC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceTransportPolicy: 'all',
}

export function CallWindow({
  chatId,
  remoteUserId,
  remoteUsername,
  role,
  withVideo: initialWithVideo,
  incomingOffer,
  onClose,
}: CallWindowProps) {
  const { outputVolume, audioOutputDeviceId, audioInputDeviceId } = useMessengerStore()
  const [status, setStatus] = useState<'connecting' | 'ringing' | 'active' | 'ended'>(
    role === 'caller' ? 'ringing' : 'connecting'
  )
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [withVideo, setWithVideo] = useState(initialWithVideo)
  const [callDuration, setCallDuration] = useState(0)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([])
  const ringtoneRef = useRef<HTMLAudioElement | null>(null)
  const hasActivatedCallRef = useRef(false)
  const iceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref to current status — avoids stale closure in endCall useCallback
  const statusRef = useRef(status)
  useEffect(() => { statusRef.current = status }, [status])

  // Play ringtone while waiting for the other side to answer
  useEffect(() => {
    if (status === 'ringing') {
      const audio = new Audio('/messme_call_ringtone.mp3')
      audio.loop = true
      audio.volume = 0.4
      audio.play().catch(() => {})
      ringtoneRef.current = audio
    } else {
      ringtoneRef.current?.pause()
      ringtoneRef.current = null
    }
    return () => {
      ringtoneRef.current?.pause()
      ringtoneRef.current = null
    }
  }, [status])

  // When status transitions to 'active' and the remote video element is now rendered,
  // apply the stored remote stream (ontrack may have fired before the element existed)
  useEffect(() => {
    if (status === 'active' && withVideo && remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current
    }
    if (status === 'active' && remoteAudioRef.current && remoteStreamRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current
      remoteAudioRef.current.volume = Math.max(0, Math.min(2, outputVolume / 100))
      if (audioOutputDeviceId && (remoteAudioRef.current as any).setSinkId) {
        ;(remoteAudioRef.current as any).setSinkId(audioOutputDeviceId).catch(() => {})
      }
    }
  }, [audioOutputDeviceId, outputVolume, status, withVideo])

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  const markCallActive = useCallback(() => {
    if (hasActivatedCallRef.current) return
    hasActivatedCallRef.current = true
    setStatus('active')
    durationTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
  }, [])

  const cleanup = useCallback(() => {
    if (durationTimerRef.current) clearInterval(durationTimerRef.current)
    durationTimerRef.current = null
    hasActivatedCallRef.current = false
    if (iceTimeoutRef.current) clearTimeout(iceTimeoutRef.current)
    iceTimeoutRef.current = null
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    pcRef.current?.close()
    pcRef.current = null
    localStreamRef.current = null
    remoteStreamRef.current = null
  }, [])

  const endCall = useCallback((notify = true) => {
    console.log('[Call] endCall — notify:', notify, 'status:', statusRef.current)
    if (notify && statusRef.current !== 'ended') {
      messengerSocket.sendCallEnd(chatId, remoteUserId)
    }
    const endSfx = new Audio('/call_end.mp3')
    endSfx.volume = 0.5
    endSfx.play().catch(() => {})
    setStatus('ended')
    cleanup()
    setTimeout(onClose, 1200)
  }, [chatId, remoteUserId, cleanup, onClose]) // no 'status' dep — uses statusRef

  // Create RTCPeerConnection and get local media
  const initPC = useCallback(async () => {
    const pc = new RTCPeerConnection(PC_CONFIG)
    pcRef.current = pc

    // Get local media
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioInputDeviceId ? { deviceId: { exact: audioInputDeviceId } } : true,
        video: withVideo ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false,
      })
      localStreamRef.current = stream
      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      if (localVideoRef.current && withVideo) {
        localVideoRef.current.srcObject = stream
      }
    } catch {
      console.error('[Call] Media access denied')
      endCall(true)
      return null
    }

    // Remote track → store stream and attach to available elements
    pc.ontrack = (e) => {
      const [remoteStream] = e.streams
      remoteStreamRef.current = remoteStream
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream
        remoteAudioRef.current.volume = Math.max(0, Math.min(2, outputVolume / 100))
        if (audioOutputDeviceId && (remoteAudioRef.current as any).setSinkId) {
          ;(remoteAudioRef.current as any).setSinkId(audioOutputDeviceId).catch(() => {})
        }
      }
    }

    // Log ICE candidates as they're gathered (still use non-trickle: all embedded in SDP)
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        console.log('[Call] ICE candidate:', e.candidate.type, e.candidate.protocol, e.candidate.address, e.candidate.port)
      } else {
        console.log('[Call] ICE gathering complete (null candidate)')
      }
    }

    pc.onicegatheringstatechange = () => {
      console.log('[Call] ICE gathering state:', pc.iceGatheringState)
    }

    // connectionState: 'connected' fires when DTLS+ICE are both confirmed
    pc.onconnectionstatechange = () => {
      console.log('[Call] Connection state:', pc.connectionState)
      if (pc.connectionState === 'connected') {
        if (iceTimeoutRef.current) clearTimeout(iceTimeoutRef.current)
        markCallActive()
      }
      if (['failed', 'closed'].includes(pc.connectionState)) {
        endCall(false)
      }
    }

    // iceConnectionState: 'connected'/'completed' fires earlier (ICE only, no DTLS)
    pc.oniceconnectionstatechange = () => {
      console.log('[Call] ICE connection state:', pc.iceConnectionState)
      if (['connected', 'completed'].includes(pc.iceConnectionState)) {
        if (iceTimeoutRef.current) clearTimeout(iceTimeoutRef.current)
        markCallActive()
      }
      if (pc.iceConnectionState === 'failed') {
        endCall(false)
      }
    }

    // ICE connection timeout — if no 'connected' within 45s, end call
    iceTimeoutRef.current = setTimeout(() => {
      if (!hasActivatedCallRef.current) {
        endCall(false)
      }
    }, 45_000)

    return pc
  }, [audioInputDeviceId, audioOutputDeviceId, outputVolume, withVideo, remoteUserId, endCall, markCallActive])

  // Wait for ICE gathering to complete (all candidates embedded in SDP)
  // Falls back after timeoutMs so gathering never blocks forever
  const waitForGathering = useCallback((pc: RTCPeerConnection, timeoutMs = 3000): Promise<void> =>
    new Promise(resolve => {
      if (pc.iceGatheringState === 'complete') {
        console.log('[Call] waitForGathering: already complete')
        resolve()
        return
      }
      console.log('[Call] waitForGathering: waiting... (timeout', timeoutMs, 'ms)')
      let done = false
      const finish = (reason: string) => {
        if (!done) {
          done = true
          console.log('[Call] waitForGathering: done —', reason)
          pc.removeEventListener('icegatheringstatechange', check)
          resolve()
        }
      }
      const timer = setTimeout(() => finish('timeout'), timeoutMs)
      const check = () => {
        if (pc.iceGatheringState === 'complete') { clearTimeout(timer); finish('complete') }
      }
      pc.addEventListener('icegatheringstatechange', check)
    })
  , [])

  // Caller: create offer after component mounts
  useEffect(() => {
    if (role !== 'caller') return
    let cancelled = false
    ;(async () => {
      console.log('[Call] Caller: initPC start')
      const pc = await initPC()
      if (!pc || cancelled) return
      console.log('[Call] Caller: createOffer')
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      console.log('[Call] Caller: setLocalDescription done, waiting for ICE gathering...')
      // Wait for full ICE gathering so all candidates are embedded in the SDP
      await waitForGathering(pc)
      if (cancelled) return
      const sdp = pc.localDescription!
      const candidateCount = (sdp.sdp.match(/a=candidate:/g) || []).length
      console.log('[Call] Caller: sending offer with', candidateCount, 'candidates')
      const { user } = useMessengerStore.getState()
      // Send localDescription (not offer) — it has all a=candidate lines
      messengerSocket.sendCallOffer(chatId, remoteUserId, user?.id ?? '', user?.username ?? '', sdp, withVideo)
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Callee: answer the incoming offer
  useEffect(() => {
    if (role !== 'callee' || !incomingOffer) return
    let cancelled = false
    ;(async () => {
      console.log('[Call] Callee: initPC start')
      const pc = await initPC()
      if (!pc || cancelled) return
      const offerCandidates = (incomingOffer.sdp?.match(/a=candidate:/g) || []).length
      console.log('[Call] Callee: setRemoteDescription (offer has', offerCandidates, 'candidates)')
      // Offer SDP already contains all caller candidates (non-trickle)
      await pc.setRemoteDescription(incomingOffer)
      iceCandidateQueueRef.current = []
      console.log('[Call] Callee: createAnswer')
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      console.log('[Call] Callee: setLocalDescription done, waiting for ICE gathering...')
      // Wait for full ICE gathering so all candidates are embedded in the answer SDP
      await waitForGathering(pc)
      if (cancelled) return
      const sdp = pc.localDescription!
      const candidateCount = (sdp.sdp.match(/a=candidate:/g) || []).length
      console.log('[Call] Callee: sending answer with', candidateCount, 'candidates')
      messengerSocket.sendCallAnswer(chatId, remoteUserId, sdp)
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // WS events during call
  useEffect(() => {
    const handleAnswered = async (data: { chatId: string; answer: RTCSessionDescriptionInit }) => {
      if (data.chatId !== chatId) return
      if (!pcRef.current) { console.warn('[Call] handleAnswered: pcRef is null!'); return }
      const candidateCount = (data.answer.sdp?.match(/a=candidate:/g) || []).length
      console.log('[Call] Caller: received answer with', candidateCount, 'candidates')
      // Answer SDP contains all callee candidates (non-trickle)
      await pcRef.current.setRemoteDescription(data.answer)
      console.log('[Call] Caller: setRemoteDescription(answer) done')
    }

    // Fallback: handle any stray trickle candidates (e.g. from older clients)
    const handleIce = async (data: { targetUserId: string; candidate: RTCIceCandidateInit }) => {
      if (!pcRef.current?.remoteDescription) return
      await pcRef.current.addIceCandidate(data.candidate).catch(() => {})
    }

    const handleEnded = (data: { chatId: string }) => {
      if (data.chatId === chatId) endCall(false)
    }

    const handleRejected = (data: { chatId: string }) => {
      if (data.chatId === chatId) endCall(false)
    }

    messengerSocket.on('call-answered', handleAnswered)
    messengerSocket.on('call-ice-candidate', handleIce)
    messengerSocket.on('call-ended', handleEnded)
    messengerSocket.on('call-rejected', handleRejected)
    return () => {
      messengerSocket.off('call-answered', handleAnswered)
      messengerSocket.off('call-ice-candidate', handleIce)
      messengerSocket.off('call-ended', handleEnded)
      messengerSocket.off('call-rejected', handleRejected)
    }
  }, [chatId, endCall])

  // Cleanup on unmount
  useEffect(() => () => cleanup(), [cleanup])

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    setIsMuted(m => !m)
  }

  const toggleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
    setIsCameraOff(c => !c)
  }

  const statusLabel = {
    connecting: 'Подключение...',
    ringing: 'Вызов...',
    active: formatDuration(callDuration),
    ended: 'Звонок завершён',
  }[status]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080810]/95 backdrop-blur-xl">
      {/* Remote video fullscreen */}
      {withVideo && status === 'active' && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {withVideo && status === 'active' && (
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70" />
      )}

      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div className="relative w-full h-full flex flex-col items-center justify-between py-16 px-6 z-10">
        {/* Top: avatar + name */}
        <div className="flex flex-col items-center gap-5 mt-4">
          <div className="relative">
            {status !== 'active' && (
              <>
                <span className="absolute inset-0 rounded-full bg-[#5d6cf5]/20 animate-ping" />
                <span className="absolute -inset-4 rounded-full bg-[#5d6cf5]/10 animate-pulse" />
              </>
            )}
            <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-[#5d6cf5] to-[#3a45c9] flex items-center justify-center text-4xl font-bold text-white shadow-[0_8px_40px_rgba(93,108,245,0.5)] select-none">
              {(remoteUsername || '?')[0].toUpperCase()}
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-white tracking-tight">{remoteUsername}</h2>
            <p className={cn(
              'text-base mt-1 transition-colors font-mono',
              status === 'active' ? 'text-[#0ed221]' : 'text-white/40'
            )}>
              {statusLabel}
            </p>
          </div>
        </div>

        {/* Local PiP */}
        {withVideo && (
          <video
            ref={localVideoRef}
            autoPlay playsInline muted
            className="absolute top-20 right-4 z-20 w-28 h-40 rounded-2xl object-cover border border-white/10 bg-black shadow-lg"
          />
        )}

        {/* Controls */}
        <div className="flex items-center gap-6">
          {/* Mute */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={toggleMute}
              className={cn(
                'w-14 h-14 rounded-full flex items-center justify-center transition-all',
                isMuted
                  ? 'bg-white/20 shadow-[0_0_0_2px_rgba(255,255,255,0.3)]'
                  : 'bg-white/10 hover:bg-white/15'
              )}
            >
              {isMuted ? <MicOff className="h-6 w-6 text-white" /> : <Mic className="h-6 w-6 text-white" />}
            </button>
            <span className="text-xs text-white/40">{isMuted ? 'Включить' : 'Выкл. звук'}</span>
          </div>

          {/* Hang up */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => endCall(true)}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 flex items-center justify-center transition-all shadow-[0_8px_24px_rgba(239,68,68,0.5)]"
            >
              <PhoneOff className="h-7 w-7 text-white" />
            </button>
            <span className="text-xs text-white/40">Завершить</span>
          </div>

          {/* Camera */}
          {withVideo ? (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={toggleCamera}
                className={cn(
                  'w-14 h-14 rounded-full flex items-center justify-center transition-all',
                  isCameraOff
                    ? 'bg-white/20 shadow-[0_0_0_2px_rgba(255,255,255,0.3)]'
                    : 'bg-white/10 hover:bg-white/15'
                )}
              >
                {isCameraOff ? <VideoOff className="h-6 w-6 text-white" /> : <Video className="h-6 w-6 text-white" />}
              </button>
              <span className="text-xs text-white/40">{isCameraOff ? 'Включить' : 'Выкл. камеру'}</span>
            </div>
          ) : <div className="w-14" />}
        </div>
      </div>
    </div>
  )
}

// ── Incoming call dialog ──────────────────────────────────────────────────────

interface IncomingCallDialogProps {
  callerName: string
  withVideo: boolean
  onAccept: () => void
  onReject: () => void
}

export function IncomingCallDialog({ callerName, withVideo, onAccept, onReject }: IncomingCallDialogProps) {
  // Play ringtone for the duration of the incoming call dialog
  useEffect(() => {
    const audio = new Audio('/messme_call_ringtone.mp3')
    audio.loop = true
    audio.volume = 0.4
    audio.play().catch(() => {})
    return () => { audio.pause() }
  }, [])

  const playEndSfx = () => {
    const sfx = new Audio('/call_end.mp3')
    sfx.volume = 0.5
    sfx.play().catch(() => {})
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080810]/95 backdrop-blur-xl">
      <div className="w-full h-full flex flex-col items-center justify-between py-20 px-6">
        {/* Label + avatar */}
        <div className="flex flex-col items-center gap-5">
          <p className="text-white/30 text-xs font-semibold tracking-widest uppercase">
            {withVideo ? 'Входящий видеозвонок' : 'Входящий звонок'}
          </p>
          <div className="relative">
            <span className="absolute inset-0 rounded-full bg-[#5d6cf5]/25 animate-ping" />
            <span className="absolute -inset-4 rounded-full bg-[#5d6cf5]/10 animate-pulse" />
            <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-[#5d6cf5] to-[#3a45c9] flex items-center justify-center text-5xl font-bold text-white shadow-[0_8px_48px_rgba(93,108,245,0.5)] select-none">
              {(callerName || '?')[0].toUpperCase()}
            </div>
          </div>
          <h2 className="text-3xl font-semibold text-white tracking-tight">{callerName}</h2>
        </div>

        {/* Buttons */}
        <div className="flex items-end justify-center gap-20">
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => { playEndSfx(); onReject() }}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 flex items-center justify-center transition-all shadow-[0_8px_24px_rgba(239,68,68,0.4)]"
            >
              <PhoneOff className="h-7 w-7 text-white" />
            </button>
            <span className="text-white/40 text-sm">Отклонить</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => { playEndSfx(); onAccept() }}
              className="w-16 h-16 rounded-full bg-[#0ed221] hover:bg-[#0bc01e] active:scale-95 flex items-center justify-center transition-all shadow-[0_8px_24px_rgba(14,210,33,0.4)]"
            >
              <Phone className="h-7 w-7 text-white" />
            </button>
            <span className="text-white/40 text-sm">Принять</span>
          </div>
        </div>
      </div>
    </div>
  )
}
