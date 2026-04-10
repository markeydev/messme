'use client'

import { useState, useRef } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Camera, X, Check, ArrowLeft, Users, LogOut } from 'lucide-react'
import { chatsAPI, profileAPI, type Chat } from '@/lib/api'
import { useMessengerStore } from '@/lib/store'
import { cn } from '@/lib/utils'

interface Member {
  id: string
  username: string
  avatarUrl?: string | null
  publicKey?: string | null
}

interface GroupSettingsDialogProps {
  chat: Chat
  open: boolean
  onOpenChange: (open: boolean) => void
  members: Member[]
  currentUserId: string
  onLeave: () => void
}

export function GroupSettingsDialog({ chat, open, onOpenChange, members, currentUserId, onLeave }: GroupSettingsDialogProps) {
  const { updateChat } = useMessengerStore()

  const [title, setTitle] = useState(chat.title ?? '')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleClose = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarPreview(null)
    setAvatarFile(null)
    setError(null)
    setShowLeaveConfirm(false)
    onOpenChange(false)
  }

  if (!open) return null

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  const clearAvatar = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarPreview(null)
    setAvatarFile(null)
  }

  const handleSave = async () => {
    setError(null)
    setIsSaving(true)
    try {
      let newAvatarUrl: string | null | undefined = undefined
      if (avatarFile) {
        const uploaded = await profileAPI.uploadAvatar(avatarFile, 'group')
        if (uploaded.error || !uploaded.url) {
          setError(uploaded.error ?? 'Ошибка загрузки аватара')
          setIsSaving(false)
          return
        }
        newAvatarUrl = uploaded.url
      }
      const trimmed = title.trim()
      const result = await chatsAPI.updateGroupSettings(chat.id, trimmed, newAvatarUrl)
      if (result.error || !result.chat) {
        setError(result.error ?? 'Ошибка сохранения')
        return
      }
      updateChat(chat.id, {
        title: result.chat.title ?? chat.title,
        avatarUrl: newAvatarUrl !== undefined ? newAvatarUrl : chat.avatarUrl,
      })
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
      handleClose()
    } catch {
      setError('Ошибка соединения')
    } finally {
      setIsSaving(false)
    }
  }

  const handleLeave = async () => {
    setIsLeaving(true)
    try {
      const result = await chatsAPI.leaveGroup(chat.id)
      if (result.error) {
        setError(result.error)
        return
      }
      onLeave()
      handleClose()
    } catch {
      setError('Ошибка соединения')
    } finally {
      setIsLeaving(false)
    }
  }

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  const currentAvatar = avatarPreview ?? chat.avatarUrl ?? null

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-[#111112] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06] flex-shrink-0">
        <button
          onClick={handleClose}
          className="h-8 w-8 flex items-center justify-center rounded-xl text-black/50 dark:text-white/50 hover:bg-black/[0.05] dark:hover:bg-white/[0.07] transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="font-semibold text-[17px] text-black dark:text-white flex-1">Настройки группы</h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col items-center gap-5 px-4 py-6">
          {/* Avatar */}
          <div className="relative">
            <Avatar className="h-24 w-24 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              {currentAvatar && <AvatarImage src={currentAvatar} className="object-cover" />}
              <AvatarFallback className="bg-[#5d6cf5] text-white text-2xl font-bold">
                <Users className="h-10 w-10" />
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-[#5d6cf5] flex items-center justify-center shadow-[0px_6px_20px_0px_rgba(93,108,245,0.35)] transition-colors hover:bg-[#4a5be0]"
            >
              <Camera className="h-4 w-4 text-white" />
            </button>
            {avatarPreview && (
              <button
                onClick={clearAvatar}
                className="absolute top-0 right-0 h-6 w-6 rounded-full bg-black/20 hover:bg-black/30 flex items-center justify-center"
              >
                <X className="h-3.5 w-3.5 text-white" />
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>

          {/* Title */}
          <div className="w-full space-y-1.5">
            <label className="text-xs text-black/40 dark:text-white/40 font-semibold uppercase tracking-wider px-1">Название группы</label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Введите название"
              className="bg-black/[0.05] dark:bg-white/[0.07] border-0 text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 rounded-xl h-11 text-[15px]"
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <Button
            onClick={handleSave}
            disabled={isSaving || !title.trim()}
            className="w-full bg-[#5d6cf5] hover:bg-[#4a5be0] h-11 rounded-xl text-white font-semibold text-[15px] shadow-[0px_6px_20px_0px_rgba(93,108,245,0.25)]"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1.5" />Сохранить</>}
          </Button>

          {/* Members list */}
          <div className="w-full space-y-1.5">
            <label className="text-xs text-black/40 dark:text-white/40 font-semibold uppercase tracking-wider px-1">
              Участники · {members.length}
            </label>
            <div className="bg-black/[0.03] dark:bg-white/[0.05] rounded-2xl overflow-hidden">
              {members.map((member, i) => (
                <div
                  key={member.id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3',
                    i < members.length - 1 && 'border-b border-black/[0.04] dark:border-white/[0.04]'
                  )}
                >
                  <Avatar className="h-9 w-9 flex-shrink-0">
                    {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt={member.username} />}
                    <AvatarFallback className="bg-[#5d6cf5] text-white text-xs font-medium">
                      {getInitials(member.username)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-[15px] text-black dark:text-white flex-1">{member.username}</span>
                  {member.id === chat.ownerId && (
                    <span className="text-xs text-[#5d6cf5] font-medium">Создатель</span>
                  )}
                  {member.id === currentUserId && member.id !== chat.ownerId && (
                    <span className="text-xs text-black/30 dark:text-white/30">Вы</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Leave group */}
          {!showLeaveConfirm ? (
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-red-50 dark:bg-red-500/[0.12] text-red-500 font-semibold text-[15px] hover:bg-red-100 dark:hover:bg-red-500/[0.18] transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Выйти из группы
            </button>
          ) : (
            <div className="w-full bg-black/[0.03] dark:bg-white/[0.05] rounded-2xl p-4 space-y-3">
              <p className="text-[15px] text-center text-black dark:text-white font-medium">Вы уверены?</p>
              <p className="text-sm text-center text-black/40 dark:text-white/40">Вы покинете группу «{chat.title}»</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="flex-1 h-10 rounded-xl bg-black/[0.05] dark:bg-white/[0.07] text-black/60 dark:text-white/60 font-medium text-sm transition-colors hover:bg-black/[0.08] dark:hover:bg-white/[0.10]"
                >
                  Отмена
                </button>
                <button
                  onClick={handleLeave}
                  disabled={isLeaving}
                  className="flex-1 h-10 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium text-sm transition-colors flex items-center justify-center"
                >
                  {isLeaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Покинуть'}
                </button>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
