'use client'

import { useState, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Loader2, Camera, X, Check, Bell, BellOff } from 'lucide-react'
import { profileAPI, type User } from '@/lib/api'
import { useMessengerStore } from '@/lib/store'
import { cn } from '@/lib/utils'

interface ProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const { user, updateUser, notificationsEnabled, setNotificationsEnabled } = useMessengerStore()

  const [username, setUsername] = useState(user?.username ?? '')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)


  const handleOpen = (v: boolean) => {
    if (v) {
      setUsername(user?.username ?? '')
      setAvatarPreview(null)
      setAvatarFile(null)
      setError(null)
    }
    onOpenChange(v)
  }

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
    if (!user) return
    setError(null)
    setIsSaving(true)
    try {
      let newAvatarUrl: string | null | undefined = undefined

      if (avatarFile) {
        const uploaded = await profileAPI.uploadAvatar(avatarFile, 'user')
        if (uploaded.error || !uploaded.url) {
          setError(uploaded.error ?? 'Ошибка загрузки аватара')
          setIsSaving(false)
          return
        }
        newAvatarUrl = uploaded.url
      }

      const trimmed = username.trim()
      const usernameChanged = trimmed !== user.username
      const avatarChanged = newAvatarUrl !== undefined

      if (!usernameChanged && !avatarChanged) {
        onOpenChange(false)
        return
      }

      const result = await profileAPI.updateProfile(
        usernameChanged ? trimmed : user.username,
        avatarChanged ? newAvatarUrl : undefined
      )

      if (result.error || !result.user) {
        setError(result.error ?? 'Ошибка сохранения')
        return
      }

      updateUser(result.user)
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
      onOpenChange(false)
    } catch {
      setError('Ошибка соединения')
    } finally {
      setIsSaving(false)
    }
  }

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  const currentAvatar = avatarPreview ?? user?.avatarUrl ?? null

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white">Профиль</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-5 mt-2">
          {/* Avatar picker */}
          <div className="relative">
            <Avatar className="h-24 w-24 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              {currentAvatar && <AvatarImage src={currentAvatar} className="object-cover" />}
              <AvatarFallback className="bg-indigo-600 text-white text-2xl font-semibold">
                {getInitials(username || user?.username || '?')}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center shadow-md transition-colors"
              title="Изменить фото"
            >
              <Camera className="h-4 w-4 text-white" />
            </button>
            {avatarPreview && (
              <button
                onClick={clearAvatar}
                className="absolute top-0 right-0 h-6 w-6 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center"
                title="Сбросить"
              >
                <X className="h-3.5 w-3.5 text-gray-300" />
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>

          {/* Username field */}
          <div className="w-full space-y-1.5">
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Имя пользователя</label>
            <Input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Введите имя"
              className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 rounded-xl h-10"
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            />
          </div>

          {/* Email (read-only display) */}
          {user?.email && (
            <div className="w-full space-y-1.5">
              <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Email</label>
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl h-10 flex items-center px-3">
                <span className="text-sm text-gray-400">{user.email}</span>
              </div>
            </div>
          )}

          {/* Global notifications toggle */}
          <div className="w-full flex items-center justify-between px-1">
            <div className="flex items-center gap-2.5">
              {notificationsEnabled
                ? <Bell className="h-4 w-4 text-gray-400" />
                : <BellOff className="h-4 w-4 text-gray-500" />
              }
              <div>
                <p className="text-sm text-white">Уведомления</p>
                <p className="text-xs text-gray-500">{notificationsEnabled ? 'Включены' : 'Отключены'}</p>
              </div>
            </div>
            <button
              onClick={() => setNotificationsEnabled(!notificationsEnabled)}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
                notificationsEnabled ? 'bg-indigo-600' : 'bg-gray-700'
              )}
            >
              <span className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
              )} />
            </button>
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <Button
            onClick={handleSave}
            disabled={isSaving || !username.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-500 h-10 rounded-xl"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1.5" />Сохранить</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
