'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { adminbotAPI } from '@/lib/api'
import { Bot, Copy, ExternalLink } from 'lucide-react'
import { VerifiedBadge } from './VerifiedBadge'

interface AdminBotWindowProps {
  onBack?: () => void
  isMobile?: boolean
}

export function AdminBotWindow({ onBack, isMobile }: AdminBotWindowProps) {
  const [url, setUrl] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const generateLink = async () => {
    setError('')
    setIsLoading(true)
    const result = await adminbotAPI.generatePanelLink()
    if (result.error) setError(result.error)
    else {
      setUrl(result.url ?? '')
      setExpiresAt(result.expiresAt ?? '')
    }
    setIsLoading(false)
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111112]">
      <div className="px-4 min-h-16 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center gap-3" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {isMobile && (
          <Button variant="ghost" onClick={onBack} className="h-8 px-2 text-sm">
            Назад
          </Button>
        )}
        <div className="h-9 w-9 rounded-full bg-[#5d6cf5]/20 text-[#5d6cf5] flex items-center justify-center">
          <Bot className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-sm text-black dark:text-white">adminbot</p>
            <VerifiedBadge />
          </div>
          <p className="text-xs text-black/40 dark:text-white/40">Панель администрирования</p>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-3">
        <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] p-4 bg-black/[0.02] dark:bg-white/[0.03]">
          <p className="text-sm text-black/70 dark:text-white/70 mb-3">
            Сгенерируйте личную ссылку на admin-панель. Ссылка действует 24 часа.
          </p>
          <Button onClick={generateLink} disabled={isLoading} className="bg-[#5d6cf5] hover:bg-[#4a5be0]">
            {isLoading ? 'Генерируем…' : 'Сгенерировать ссылку на панель'}
          </Button>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {url && (
          <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] p-4 space-y-3">
            <p className="text-xs text-black/45 dark:text-white/45">
              Действует до: {expiresAt ? new Date(expiresAt).toLocaleString('ru-RU') : '—'}
            </p>
            <div className="text-sm break-all text-black dark:text-white">{url}</div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => navigator.clipboard.writeText(url)}
                className="border-black/20 dark:border-white/20"
              >
                <Copy className="h-4 w-4 mr-1.5" />
                Копировать
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open(url, '_blank')}
                className="border-black/20 dark:border-white/20"
              >
                <ExternalLink className="h-4 w-4 mr-1.5" />
                Открыть
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
