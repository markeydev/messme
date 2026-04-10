'use client'

import { useState, useRef, useEffect } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { useMessengerStore } from '@/lib/store'
import { messengerSocket } from '@/lib/socket'
import { chatsAPI, type Message } from '@/lib/api'
import { Send, Loader2, X, Reply, Pencil, Check, Mic, Trash2, Paperclip, FileText, Video, SwitchCamera } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MessageInputProps {
  chatId: string
  members: Array<{ id: string; username: string }>
  onMessageSent?: () => void
  replyTo?: { message: Message; text: string } | null
  onCancelReply?: () => void
  editingMessage?: Message | null
  editingText?: string
  onCancelEdit?: () => void
  onEditDone?: () => void
}

export function MessageInput({
  chatId,
  members,
  onMessageSent,
  replyTo,
  onCancelReply,
  editingMessage,
  editingText,
  onCancelEdit,
  onEditDone,
}: MessageInputProps) {
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const justSentRef = useRef(false)

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null)

  // File attachment state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingAttachment, setPendingAttachment] = useState<{
    file: File
    previewUrl?: string
  } | null>(null)

  // Video note recording state
  const [isRecordingVideo, setIsRecordingVideo] = useState(false)
  const [videoSeconds, setVideoSeconds] = useState(0)
  const [videoFacingMode, setVideoFacingMode] = useState<'user' | 'environment'>('user')
  const videoPreviewRef = useRef<HTMLVideoElement>(null)
  const videoRecorderRef = useRef<MediaRecorder | null>(null)
  const videoChunksRef = useRef<Blob[]>([])
  const videoTimerRef = useRef<NodeJS.Timeout | null>(null)
  // Keep stream in a ref so we can assign srcObject after the video element renders
  const videoStreamRef = useRef<MediaStream | null>(null)

  // Assign srcObject once the video element appears in the DOM
  useEffect(() => {
    if (isRecordingVideo && videoPreviewRef.current && videoStreamRef.current) {
      videoPreviewRef.current.srcObject = videoStreamRef.current
    }
  }, [isRecordingVideo])

  const user = useMessengerStore(s => s.user)
  const updateMessage = useMessengerStore(s => s.updateMessage)
  const addMessage = useMessengerStore(s => s.addMessage)
  const replaceMessage = useMessengerStore(s => s.replaceMessage)
  const updateMessageStatus = useMessengerStore(s => s.updateMessageStatus)

  // Pre-populate textarea when entering edit mode
  useEffect(() => {
    if (editingMessage) {
      setMessage(editingText ?? '')
      setTimeout(() => textareaRef.current?.focus(), 30)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingMessage?.id])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [message])

  useEffect(() => {
    if (message && !isTyping && user) {
      setIsTyping(true)
      messengerSocket.sendTyping(chatId, user.id, true)
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      if (isTyping && user) {
        setIsTyping(false)
        messengerSocket.sendTyping(chatId, user.id, false)
      }
    }, 2000)
    return () => { if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current) }
  }, [message, chatId, user?.id])

  const handleSend = async () => {
    if (!message.trim() || !user) return
    const text = message
      .replace(/^[\n\r\s]+/, '')
      .replace(/[\n\r\s]+$/, '')
      .replace(/(\n){3,}/g, '\n\n')
    if (!text) return

    if (editingMessage) {
      setIsSending(true)
      try {
        const result = await chatsAPI.editMessage(chatId, editingMessage.id, text)
        if (result.error || !result.message) {
          console.error('Failed to edit message:', result.error)
          return
        }
        updateMessage(chatId, editingMessage.id, text, true)
        messengerSocket.broadcastEditMessage(result.message)
        setMessage('')
        onEditDone?.()
      } catch (err) {
        console.error('Edit failed:', err)
      } finally {
        setIsSending(false)
      }
      return
    }

    // Optimistic UI
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const optimisticMsg: Message = {
      id: tempId,
      chatId,
      senderId: user.id,
      senderUsername: user.username,
      type: 'TEXT',
      content: text,
      createdAt: new Date().toISOString(),
      replyToId: replyTo?.message.id ?? null,
      replyTo: replyTo
        ? {
            id: replyTo.message.id,
            senderId: replyTo.message.senderId,
            senderUsername: replyTo.message.senderUsername,
            content: replyTo.text,
          }
        : null,
      pendingStatus: 'sending',
    }

    addMessage(chatId, optimisticMsg)
    setMessage('')
    justSentRef.current = true
    setTimeout(() => { justSentRef.current = false }, 500)
    onCancelReply?.()
    setIsTyping(false)
    messengerSocket.sendTyping(chatId, user.id, false)
    onMessageSent?.()
    setTimeout(() => textareaRef.current?.focus(), 0)

    try {
      const result = await chatsAPI.sendMessage(chatId, text, replyTo?.message.id)
      if (result.error || !result.message) {
        console.error('Failed to save message:', result.error)
        updateMessageStatus(chatId, tempId, 'failed')
        return
      }
      replaceMessage(chatId, tempId, result.message)
      messengerSocket.broadcastMessage(result.message)
    } catch (err) {
      console.error('Send failed:', err)
      updateMessageStatus(chatId, tempId, 'failed')
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const audioTypes = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
      const mimeType = audioTypes.find(t => MediaRecorder.isTypeSupported(t)) ?? ''
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.start(100)
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setRecordingSeconds(0)
      recordTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000)
    } catch {
      console.error('Microphone access denied')
    }
  }

  const stopRecording = (): Promise<{ blob: Blob; duration: number }> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current
      if (!recorder) return
      const duration = recordingSeconds
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm'
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        recorder.stream.getTracks().forEach(t => t.stop())
        resolve({ blob, duration })
      }
      recorder.stop()
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      setIsRecording(false)
      setRecordingSeconds(0)
      mediaRecorderRef.current = null
    })
  }

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop())
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    setIsRecording(false)
    setRecordingSeconds(0)
    audioChunksRef.current = []
  }

  const handleSendVoice = async () => {
    if (!user) return
    setIsUploading(true)
    try {
      const { blob, duration } = await stopRecording()
      if (blob.size < 1000) { setIsUploading(false); return } // too short
      const uploaded = await chatsAPI.uploadAudio(blob, duration)
      if (uploaded.error || !uploaded.url) { console.error(uploaded.error); setIsUploading(false); return }
      const result = await chatsAPI.sendMessage(
        chatId, '🎤', replyTo?.message.id, undefined,
        { audioUrl: uploaded.url, audioDuration: uploaded.duration }
      )
      if (result.message) messengerSocket.broadcastMessage(result.message)
      onCancelReply?.()
    } catch (err) {
      console.error('Voice send failed:', err)
    } finally {
      setIsUploading(false)
    }
  }

  const formatRecordTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} Б`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
    setPendingAttachment({ file, previewUrl })
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  const clearAttachment = () => {
    if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl)
    setPendingAttachment(null)
  }

  const handleSendFile = async () => {
    if (!pendingAttachment || !user) return
    setIsUploading(true)
    try {
      const uploaded = await chatsAPI.uploadFile(pendingAttachment.file)
      if (uploaded.error || !uploaded.url) { console.error(uploaded.error); setIsUploading(false); return }
      const isImage = pendingAttachment.file.type.startsWith('image/')
      const type = isImage ? 'IMAGE' : 'FILE'
      const result = await chatsAPI.sendMessage(
        chatId, pendingAttachment.file.name, replyTo?.message.id, undefined, undefined,
        { fileUrl: uploaded.url, fileName: uploaded.fileName!, fileSize: uploaded.fileSize!, type }
      )
      if (result.message) messengerSocket.broadcastMessage(result.message)
      clearAttachment()
      justSentRef.current = true
      setTimeout(() => { justSentRef.current = false }, 500)
      onCancelReply?.()
    } catch (err) {
      console.error('File send failed:', err)
    } finally {
      setIsUploading(false)
    }
  }

  const startVideoRecording = async (facingMode: 'user' | 'environment' = videoFacingMode) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 512 }, height: { ideal: 512 } },
        audio: true,
      })
      // Save stream to ref – srcObject will be assigned after video element renders (useEffect)
      videoStreamRef.current = stream
      const videoTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4']
      const mimeType = videoTypes.find(t => MediaRecorder.isTypeSupported(t)) ?? ''
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      videoChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) videoChunksRef.current.push(e.data) }
      recorder.start(200)
      videoRecorderRef.current = recorder
      setVideoFacingMode(facingMode)
      setIsRecordingVideo(true)
      setVideoSeconds(0)
      videoTimerRef.current = setInterval(() => setVideoSeconds(s => s + 1), 1000)
    } catch {
      console.error('Camera access denied')
    }
  }

  const stopVideoRecording = (): Promise<{ blob: Blob; duration: number }> => {
    return new Promise((resolve) => {
      const recorder = videoRecorderRef.current
      if (!recorder) return
      const duration = videoSeconds
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'video/webm'
        const blob = new Blob(videoChunksRef.current, { type: mimeType })
        recorder.stream.getTracks().forEach(t => t.stop())
        if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null
        videoStreamRef.current = null
        resolve({ blob, duration })
      }
      recorder.stop()
      if (videoTimerRef.current) clearInterval(videoTimerRef.current)
      setIsRecordingVideo(false)
      setVideoSeconds(0)
      videoRecorderRef.current = null
    })
  }

  const cancelVideoRecording = () => {
    if (videoRecorderRef.current) {
      videoRecorderRef.current.stream.getTracks().forEach(t => t.stop())
      videoRecorderRef.current.stop()
      videoRecorderRef.current = null
    }
    if (videoTimerRef.current) clearInterval(videoTimerRef.current)
    if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null
    videoStreamRef.current = null
    setIsRecordingVideo(false)
    setVideoSeconds(0)
    videoChunksRef.current = []
  }

  const switchCamera = async () => {
    const newFacing = videoFacingMode === 'user' ? 'environment' : 'user'
    // Stop current stream but KEEP accumulated chunks and timer
    const recorder = videoRecorderRef.current
    if (recorder) {
      await new Promise<void>(resolve => {
        recorder.onstop = () => resolve()
        recorder.stream.getTracks().forEach(t => t.stop())
        recorder.stop()
      })
      videoRecorderRef.current = null
    }
    if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null
    videoStreamRef.current = null
    // Start new stream with new facing mode — chunks and timer continue
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing, width: { ideal: 512 }, height: { ideal: 512 } },
        audio: true,
      })
      videoStreamRef.current = stream
      if (videoPreviewRef.current) videoPreviewRef.current.srcObject = stream
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : 'video/webm'
      const newRecorder = new MediaRecorder(stream, { mimeType })
      // Append to existing chunks — do NOT reset
      newRecorder.ondataavailable = (e) => { if (e.data.size > 0) videoChunksRef.current.push(e.data) }
      newRecorder.start(200)
      videoRecorderRef.current = newRecorder
      setVideoFacingMode(newFacing)
    } catch {
      console.error('Camera switch failed')
    }
  }

  const handleSendVideoNote = async () => {
    if (!user || !isRecordingVideo) return
    setIsUploading(true)
    try {
      const { blob, duration } = await stopVideoRecording()
      if (blob.size < 1000) { setIsUploading(false); return }
      const uploaded = await chatsAPI.uploadVideoNote(blob, duration)
      if (uploaded.error || !uploaded.url) { console.error(uploaded.error); setIsUploading(false); return }
      const result = await chatsAPI.sendMessage(
        chatId, '📹', replyTo?.message.id, undefined, undefined, undefined,
        { videoNoteUrl: uploaded.url, videoNoteDuration: uploaded.duration }
      )
      if (result.message) messengerSocket.broadcastMessage(result.message)
      onCancelReply?.()
    } catch (err) {
      console.error('Video note send failed:', err)
    } finally {
      setIsUploading(false)
    }
  }

  // Auto-stop video at 60s
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (videoSeconds >= 60 && isRecordingVideo) handleSendVideoNote() }, [videoSeconds])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (pendingAttachment) { handleSendFile() }
      else { handleSend() }
    }
    if (e.key === 'Escape') {
      if (editingMessage) { setMessage(''); onCancelEdit?.() }
      else if (replyTo) onCancelReply?.()
    }
  }

  return (
    <div className="flex-shrink-0 bg-white dark:bg-[#111112] min-w-0 overflow-hidden">
      {/* Banners – hidden during video recording */}
      {!isRecordingVideo && (
        <>
          {/* Reply banner */}
          {replyTo && !editingMessage && (
            <div className="flex items-center gap-2 px-4 py-2 border-t border-black/[0.06] dark:border-white/[0.08] bg-[#5D6CF5]/[0.05] dark:bg-[#5D6CF5]/[0.10]">
              <Reply className="h-3.5 w-3.5 text-[#5D6CF5] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-[#5D6CF5] text-xs font-semibold">{replyTo.message.senderUsername}</span>
                <p className="text-black/40 dark:text-white/40 text-xs truncate">{replyTo.text}</p>
              </div>
              <button onClick={onCancelReply} className="text-black/30 dark:text-white/30 hover:text-black/60 dark:hover:text-white/60 flex-shrink-0 p-0.5">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {/* Edit banner */}
          {editingMessage && (
            <div className="flex items-center gap-2 px-4 py-2 border-t border-black/[0.06] dark:border-white/[0.08] bg-[#5D6CF5]/[0.05] dark:bg-[#5D6CF5]/[0.10]">
              <Pencil className="h-3.5 w-3.5 text-[#5D6CF5] flex-shrink-0" />
              <span className="text-[#5D6CF5] text-xs font-semibold flex-1">Редактирование сообщения</span>
              <button onClick={() => { setMessage(''); onCancelEdit?.() }} className="text-black/30 dark:text-white/30 hover:text-black/60 dark:hover:text-white/60 flex-shrink-0 p-0.5">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {/* Attachment preview banner */}
          {pendingAttachment && (
            <div className="flex items-center gap-3 px-4 py-2 border-t border-black/[0.06] dark:border-white/[0.08] bg-black/[0.04] dark:bg-white/[0.05]">
              {pendingAttachment.previewUrl ? (
                <img src={pendingAttachment.previewUrl} alt="preview" className="h-12 w-12 rounded-lg object-cover flex-shrink-0 border border-black/[0.08] dark:border-white/[0.08]" />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-black/[0.06] dark:bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-black/40 dark:text-white/40" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-black dark:text-white font-medium truncate">{pendingAttachment.file.name}</p>
                <p className="text-xs text-black/40 dark:text-white/40">{formatFileSize(pendingAttachment.file.size)}</p>
              </div>
              <button onClick={clearAttachment} className="text-black/30 dark:text-white/30 hover:text-black/60 dark:hover:text-white/60 flex-shrink-0 p-0.5">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Video note recording overlay (fullscreen centered) ── */}
      {isRecordingVideo && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#080810]/90 backdrop-blur-xl">
          {/* Progress ring + circle preview */}
          <div className="relative">
            <svg
              width="296" height="296"
              className="absolute inset-0 pointer-events-none"
              style={{ transform: 'rotate(-90deg)' }}
            >
              <circle cx="148" cy="148" r="144" fill="none" stroke="rgba(93,108,245,0.18)" strokeWidth="4" />
              <circle
                cx="148" cy="148" r="144" fill="none"
                stroke="#5d6cf5" strokeWidth="4" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 144}
                strokeDashoffset={2 * Math.PI * 144 * (1 - videoSeconds / 60)}
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            {/* Circle video */}
            <div className="w-72 h-72 rounded-full overflow-hidden bg-black ring-2 ring-[#5d6cf5]/40">
              <video
                ref={videoPreviewRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
                style={{}}
              />
            </div>
            {/* Recording dot */}
            <span className="absolute top-3 right-3 w-4 h-4 rounded-full bg-red-500 ring-2 ring-[#080810] animate-pulse" />
          </div>

          {/* Timer */}
          <div className="mt-6 flex items-center gap-2">
            <span className="text-white font-mono text-2xl font-semibold tabular-nums">{formatRecordTime(videoSeconds)}</span>
            <span className="text-white/20 text-lg">/</span>
            <span className="text-white/30 font-mono text-lg">1:00</span>
          </div>

          {/* Controls */}
          <div className="mt-8 flex items-center gap-6">
            <button
              onClick={cancelVideoRecording}
              className="h-14 w-14 rounded-full bg-white/10 hover:bg-red-500/20 flex items-center justify-center text-white/50 hover:text-red-400 transition-colors"
              title="Отмена"
            >
              <Trash2 className="h-6 w-6" />
            </button>
            <button
              onClick={switchCamera}
              className="h-14 w-14 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center text-white/50 hover:text-white transition-colors"
              title="Переключить камеру"
            >
              <SwitchCamera className="h-6 w-6" />
            </button>
            <button
              onClick={handleSendVideoNote}
              disabled={isUploading || videoSeconds < 1}
              className="h-14 w-14 rounded-full bg-[#5d6cf5] hover:bg-[#4a5be0] disabled:opacity-40 flex items-center justify-center text-white transition-colors shadow-[0_8px_24px_rgba(93,108,245,0.4)]"
              title="Отправить"
            >
              {isUploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Send className="h-6 w-6" />}
            </button>
          </div>
        </div>
      )}

      {/* ── Normal input row ── */}
      {!isRecordingVideo && (
        <div className="flex items-end gap-2 px-4 py-3 border-t border-black/[0.06] dark:border-white/[0.08] min-w-0 overflow-hidden bg-white dark:bg-[#111112]">
          {isRecording ? (
            /* Voice recording bar */
            <>
              <button onClick={cancelRecording} className="h-[42px] w-[42px] flex-shrink-0 flex items-center justify-center rounded-xl bg-black/[0.05] dark:bg-white/[0.07] hover:bg-black/[0.08] dark:hover:bg-white/[0.10] transition-colors text-black/40 dark:text-white/40">
                <Trash2 className="h-4 w-4" />
              </button>
              <div className="flex-1 min-w-0 flex items-center gap-2 bg-black/[0.05] dark:bg-white/[0.07] rounded-xl px-3 h-[42px]">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                <span className="text-sm text-red-400 font-mono">{formatRecordTime(recordingSeconds)}</span>
                <span className="text-xs text-black/40 dark:text-white/40 flex-1">Запись...</span>
              </div>
              <button
                onClick={handleSendVoice}
                disabled={isUploading || recordingSeconds < 1}
                className="h-[42px] w-[42px] flex-shrink-0 flex items-center justify-center rounded-xl bg-[#5D6CF5] hover:bg-[#4a5be0] disabled:opacity-50 transition-colors text-white"
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </>
          ) : (
            /* Normal input */
            <>
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/*,text/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.7z"
                className="hidden"
                onChange={handleFileChange}
              />
              {/* Attach + Camera buttons */}
              {!editingMessage && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isSending || isRecording}
                    className="h-[42px] w-[42px] flex-shrink-0 flex items-center justify-center rounded-xl bg-black/[0.05] dark:bg-white/[0.07] hover:bg-black/[0.08] dark:hover:bg-white/[0.10] text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60 transition-colors disabled:opacity-50"
                    title="Прикрепить файл"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <button
                    onClick={startVideoRecording}
                    disabled={isUploading || isSending || isRecording}
                    className="h-[42px] w-[42px] flex-shrink-0 flex items-center justify-center rounded-xl bg-black/[0.05] dark:bg-white/[0.07] hover:bg-black/[0.08] dark:hover:bg-white/[0.10] text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60 transition-colors disabled:opacity-50"
                    title="Видеосообщение"
                  >
                    <Video className="h-4 w-4" />
                  </button>
                </>
              )}
              <div className="flex-1 min-w-0">
                <Textarea
                  ref={textareaRef}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={editingMessage ? 'Изменить сообщение...' : 'Сообщение... (Enter для отправки)'}
                  disabled={isSending || isUploading}
                  rows={1}
                  className="w-full min-h-[42px] max-h-[120px] resize-none bg-black/[0.05] dark:bg-white/[0.07] border-0 text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 focus-visible:ring-1 focus-visible:ring-[#5D6CF5]/40 rounded-xl px-3 py-2.5 text-sm block"
                />
              </div>
              {/* Send / Mic button */}
              {message.trim() || editingMessage || pendingAttachment ? (
                <button
                  type="button"
                  onTouchStart={e => {
                    e.preventDefault() // fires before blur+layout shift; prevents synthesized mousedown
                    if ((message.trim() || !!pendingAttachment) && !isSending && !isUploading) {
                      if (pendingAttachment) handleSendFile()
                      else handleSend()
                    }
                  }}
                  onMouseDown={e => {
                    e.preventDefault() // desktop: prevent textarea blur
                    if ((message.trim() || !!pendingAttachment) && !isSending && !isUploading) {
                      if (pendingAttachment) handleSendFile()
                      else handleSend()
                    }
                  }}
                  className={cn(
                    'h-[42px] w-[42px] flex-shrink-0 rounded-xl transition-all active:scale-95 p-0 flex items-center justify-center',
                    (message.trim() || pendingAttachment)
                      ? editingMessage
                        ? 'bg-[#22c55e] hover:bg-[#16a34a] text-white'
                        : 'bg-[#5D6CF5] hover:bg-[#4a5be0] text-white'
                      : 'bg-black/[0.05] dark:bg-white/[0.07] text-black/20 dark:text-white/20 opacity-50'
                  )}
                >
                  {isSending || isUploading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : editingMessage
                      ? <Check className="h-4 w-4" />
                      : <Send className="h-4 w-4" />}
                </button>
              ) : (
                <button
                  onTouchStart={e => { e.preventDefault(); if (!justSentRef.current && !isSending) startRecording() }}
                  onMouseDown={e => { e.preventDefault(); if (!justSentRef.current && !isSending) startRecording() }}
                  disabled={isSending}
                  className="h-[42px] w-[42px] flex-shrink-0 flex items-center justify-center rounded-xl bg-black/[0.05] dark:bg-white/[0.07] hover:bg-black/[0.08] dark:hover:bg-white/[0.10] active:bg-[#5D6CF5]/10 text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60 transition-colors disabled:opacity-50"
                  title="Голосовое сообщение"
                >
                  <Mic className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
