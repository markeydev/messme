import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function getSafeImageUrl(value?: string | null): string | null {
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

export async function openExternalUrl(url: string) {
  if (!isSafeHttpUrl(url)) return
  if (typeof window !== 'undefined' && window.messmeDesktop?.openExternal) {
    await window.messmeDesktop.openExternal(url)
    return
  }
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
