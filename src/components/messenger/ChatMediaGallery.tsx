'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { chatsAPI } from '@/lib/api'
import { ArrowLeft, Download, FileText, Image, Video, Loader2, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type MediaTab = 'images' | 'files' | 'videos'

type MediaItem = {
  id: string
  type: string
  url: string | null
  fileName: string | null
  fileSize: number | null
  createdAt: string
  senderUsername: string
}

interface ChatMediaGalleryProps {
  chatId: string
  chatTitle: string
  onClose: () => void
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function ChatMediaGallery({ chatId, chatTitle, onClose }: ChatMediaGalleryProps) {
  const [activeTab, setActiveTab] = useState<MediaTab>('images')
  const [items, setItems] = useState<MediaItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const loaderRef = useRef<HTMLDivElement | null>(null)
  const tabRef = useRef<MediaTab>(activeTab)
  tabRef.current = activeTab

  const loadItems = useCallback(async (tab: MediaTab, cursor?: string) => {
    setIsLoading(true)
    const result = await chatsAPI.getMedia(chatId, tab, cursor)
    if (result.error || !result.items) { setIsLoading(false); return }
    setItems(prev => cursor ? [...prev, ...result.items!] : result.items!)
    setHasMore(result.hasMore ?? false)
    setNextCursor(result.nextCursor ?? null)
    setIsLoading(false)
  }, [chatId])

  useEffect(() => {
    setItems([])
    setHasMore(false)
    setNextCursor(null)
    setLightboxIndex(null)
    void loadItems(activeTab)
  }, [activeTab, loadItems])

  // Infinite scroll
  useEffect(() => {
    if (!loaderRef.current) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting && hasMore && !isLoading) {
        void loadItems(tabRef.current, nextCursor ?? undefined)
      }
    }, { threshold: 0.1 })
    observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [hasMore, isLoading, nextCursor, loadItems])

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIndex === null) return
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setLightboxIndex(i => (i !== null && i > 0) ? i - 1 : i)
      if (e.key === 'ArrowRight') setLightboxIndex(i => (i !== null && i < items.length - 1) ? i + 1 : i)
      if (e.key === 'Escape') setLightboxIndex(null)
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [lightboxIndex, items.length])

  const tabs: { id: MediaTab; label: string; icon: React.ReactNode }[] = [
    { id: 'images', label: 'Фото', icon: <Image className="h-4 w-4" /> },
    { id: 'videos', label: 'Видео', icon: <Video className="h-4 w-4" /> },
    { id: 'files', label: 'Файлы', icon: <FileText className="h-4 w-4" /> },
  ]

  const lightboxItem = lightboxIndex !== null ? items[lightboxIndex] : null

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111112]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 min-h-14 border-b border-black/[0.06] dark:border-white/[0.08] flex-shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <button
          onClick={onClose}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-black/40 dark:text-white/40 hover:text-black/80 dark:hover:text-white/80 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-black dark:text-white truncate">Медиафайлы</p>
          <p className="text-xs text-black/40 dark:text-white/40 truncate">{chatTitle}</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex px-3 pt-3 pb-0 gap-1 flex-shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'bg-[#5d6cf5] text-white shadow-sm'
                : 'bg-black/[0.05] dark:bg-white/[0.07] text-black/50 dark:text-white/50 hover:text-black/80 dark:hover:text-white/80'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {isLoading && items.length === 0 && (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-black/30 dark:text-white/30" />
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-black/30 dark:text-white/30">
            {activeTab === 'images' && <Image className="h-10 w-10" />}
            {activeTab === 'videos' && <Video className="h-10 w-10" />}
            {activeTab === 'files' && <FileText className="h-10 w-10" />}
            <p className="text-sm">
              {activeTab === 'images' ? 'Нет фото' : activeTab === 'videos' ? 'Нет видео' : 'Нет файлов'}
            </p>
          </div>
        )}

        {/* Photo grid */}
        {activeTab === 'images' && items.length > 0 && (
          <div className="grid grid-cols-3 gap-1">
            {items.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => setLightboxIndex(idx)}
                className="relative aspect-square overflow-hidden rounded-lg bg-black/[0.06] dark:bg-white/[0.06] hover:opacity-90 transition-opacity"
              >
                {item.url && (
                  <img
                    src={item.url}
                    alt={item.fileName ?? 'фото'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Video grid */}
        {activeTab === 'videos' && items.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {items.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => setLightboxIndex(idx)}
                className="relative aspect-video overflow-hidden rounded-xl bg-black/[0.06] dark:bg-white/[0.06] hover:opacity-90 transition-opacity group"
              >
                {item.url && (
                  <video
                    src={item.url}
                    className="w-full h-full object-cover"
                    preload="metadata"
                  />
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-9 w-9 rounded-full bg-black/50 flex items-center justify-center">
                    <Video className="h-4 w-4 text-white" />
                  </div>
                </div>
                <div className="absolute bottom-1.5 left-2 right-2 text-[10px] text-white/80 truncate">
                  {formatDate(item.createdAt)} · {item.senderUsername}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* File list */}
        {activeTab === 'files' && items.length > 0 && (
          <div className="space-y-1.5">
            {items.map(item => (
              <a
                key={item.id}
                href={item.url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                download={item.fileName ?? true}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/[0.06] dark:hover:bg-white/[0.07] transition-colors group"
              >
                <div className="h-10 w-10 rounded-lg bg-[#5d6cf5]/15 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-[#5d6cf5]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-black dark:text-white truncate">{item.fileName ?? 'Файл'}</p>
                  <p className="text-xs text-black/40 dark:text-white/40">
                    {[formatFileSize(item.fileSize), item.senderUsername, formatDate(item.createdAt)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Download className="h-4 w-4 text-black/30 dark:text-white/30 group-hover:text-[#5d6cf5] transition-colors flex-shrink-0" />
              </a>
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel */}
        {hasMore && (
          <div ref={loaderRef} className="flex justify-center py-4">
            {isLoading && <Loader2 className="h-5 w-5 animate-spin text-black/30 dark:text-white/30" />}
          </div>
        )}
      </div>

      {/* Lightbox for images */}
      <Dialog open={lightboxIndex !== null && activeTab === 'images'} onOpenChange={open => { if (!open) setLightboxIndex(null) }}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black border-0 overflow-hidden">
          {lightboxItem?.url && (
            <div className="relative flex items-center justify-center w-full h-full min-h-[60vh]">
              <img
                src={lightboxItem.url}
                alt={lightboxItem.fileName ?? 'фото'}
                className="max-w-full max-h-[90vh] object-contain"
              />
              {/* Nav buttons */}
              {lightboxIndex !== null && lightboxIndex > 0 && (
                <button
                  onClick={() => setLightboxIndex(i => (i !== null ? i - 1 : i))}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {lightboxIndex !== null && lightboxIndex < items.length - 1 && (
                <button
                  onClick={() => setLightboxIndex(i => (i !== null ? i + 1 : i))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
              {/* Info bar */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-3 flex items-center justify-between">
                <div className="text-xs text-white/80">
                  {lightboxItem.senderUsername} · {formatDate(lightboxItem.createdAt)}
                </div>
                <a
                  href={lightboxItem.url}
                  download={lightboxItem.fileName ?? true}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-7 w-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  <Download className="h-3.5 w-3.5 text-white" />
                </a>
              </div>
              {/* Close */}
              <button
                onClick={() => setLightboxIndex(null)}
                className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox for videos */}
      <Dialog open={lightboxIndex !== null && activeTab === 'videos'} onOpenChange={open => { if (!open) setLightboxIndex(null) }}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black border-0 overflow-hidden">
          {lightboxItem?.url && (
            <div className="relative flex items-center justify-center min-h-[40vh]">
              <video
                src={lightboxItem.url}
                controls
                autoPlay
                className="max-w-full max-h-[85vh] rounded"
              />
              <button
                onClick={() => setLightboxIndex(null)}
                className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
