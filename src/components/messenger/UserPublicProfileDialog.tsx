'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { clipMeAPI } from '@/lib/api'

interface UserPublicProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string | null
  fallbackUser?: {
    username?: string
    avatarUrl?: string | null
  }
  onOpenLinkedChannel?: (channelId: string) => void
}

const getSafeImageUrl = (value?: string | null): string | null => {
  if (!value) return null
  if (value.startsWith('blob:')) return value
  if (value.startsWith('data:image/')) return value
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    const parsed = new URL(value, base)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return value
    return null
  } catch {
    return null
  }
}

export function UserPublicProfileDialog({
  open,
  onOpenChange,
  userId,
  fallbackUser,
  onOpenLinkedChannel,
}: UserPublicProfileDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isAvatarPreviewOpen, setIsAvatarPreviewOpen] = useState(false)
  const [profile, setProfile] = useState<{
    username: string
    avatarUrl?: string | null
    clipMeBio?: string | null
    linkedMessmeChannelId?: string | null
    linkedMessmeChannel?: {
      id: string
      title: string
      subscribersCount: number
      lastMessageText?: string | null
    } | null
  } | null>(null)

  useEffect(() => {
    if (!open || !userId) return
    let cancelled = false
    setIsLoading(true)
    clipMeAPI.getUserChannel(userId).then(result => {
      if (cancelled) return
      const user = result.user
      if (!user) {
        setProfile(null)
        setIsLoading(false)
        return
      }
      setProfile({
        username: user.username,
        avatarUrl: user.avatarUrl ?? null,
        clipMeBio: user.clipMeBio ?? null,
        linkedMessmeChannelId: user.linkedMessmeChannelId ?? null,
        linkedMessmeChannel: result.linkedMessmeChannel ?? null,
      })
      setIsLoading(false)
    }).catch(() => {
      if (cancelled) return
      setProfile(null)
      setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [open, userId])

  const displayName = profile?.username ?? fallbackUser?.username ?? 'Пользователь'
  const displayAvatar = getSafeImageUrl(profile?.avatarUrl || fallbackUser?.avatarUrl || null)
  const channel = profile?.linkedMessmeChannel ?? null

  const initials = useMemo(
    () => displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2),
    [displayName]
  )
  const handleOpenAvatarPreview = useCallback(() => {
    if (displayAvatar) setIsAvatarPreviewOpen(true)
  }, [displayAvatar])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-[#121212] border-white/10 text-white">
        <DialogTitle>Профиль</DialogTitle>
        <div className="flex flex-col items-center gap-4 py-1">
          <Avatar
            className="h-20 w-20 border border-white/20 cursor-zoom-in"
            onClick={handleOpenAvatarPreview}
          >
            {displayAvatar && <AvatarImage src={displayAvatar} alt={displayName} />}
            <AvatarFallback className="bg-[#5d6cf5] text-white text-lg font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <p className="text-base font-semibold text-center">{displayName}</p>

          {isLoading ? (
            <p className="text-sm text-white/60">Загрузка профиля...</p>
          ) : (
            <div className="w-full space-y-3">
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <p className="text-xs uppercase tracking-wide text-white/50 mb-1">О себе</p>
                <p className="text-sm text-white/85 whitespace-pre-wrap break-words">
                  {profile?.clipMeBio?.trim() ? profile.clipMeBio : 'Не указано'}
                </p>
              </div>

              {channel && (
                <button
                  className="w-full rounded-xl bg-white/5 border border-white/10 p-3 text-left hover:bg-white/10 transition-colors"
                  onClick={() => {
                    onOpenLinkedChannel?.(channel.id)
                    onOpenChange(false)
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white truncate">{channel.title}</p>
                    <p className="text-xs text-white/60 whitespace-nowrap">{channel.subscribersCount} подписчиков</p>
                  </div>
                  <p className="text-xs text-white/55 mt-1.5 line-clamp-1 break-all">
                    {channel.lastMessageText?.trim() ? channel.lastMessageText : 'Сообщений пока нет'}
                  </p>
                </button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
      <Dialog open={isAvatarPreviewOpen} onOpenChange={setIsAvatarPreviewOpen}>
        <DialogContent className="bg-black/90 border-0 max-w-3xl p-2 flex items-center justify-center">
          {displayAvatar && (
            <img
              src={displayAvatar}
              alt={displayName}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
