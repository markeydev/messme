'use client'

import { useEffect } from 'react'
import { useMessengerStore } from '@/lib/store'

export function ThemeController() {
  const darkMode = useMessengerStore(s => s.darkMode)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])
  return null
}
