'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authAPI, setAuthToken } from '@/lib/api'
import { useMessengerStore } from '@/lib/store'
import { Loader2, MessageCircle, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

type Mode = 'login' | 'register' | 'verify' | 'forgot' | 'reset'

interface AuthFormProps {
  onSuccess?: () => void
}

export function AuthForm({ onSuccess }: AuthFormProps) {
  const [mode, setMode] = useState<Mode>('login')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // login
  const [loginField, setLoginField] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // register
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // verify / reset shared
  const [pendingEmail, setPendingEmail] = useState('')
  const [verifyCode, setVerifyCode] = useState('')

  // reset
  const [forgotEmail, setForgotEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')

  const { setUser, setAuthenticated } = useMessengerStore()

  const signIn = (user: NonNullable<Awaited<ReturnType<typeof authAPI.login>>['user']>, token: string) => {
    setAuthToken(token)
    setUser(user)
    setAuthenticated(true)
    onSuccess?.()
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const result = await authAPI.login(loginField, loginPassword)
      if (result.error) setError(result.error)
      else if (result.needsVerification && result.email) {
        setPendingEmail(result.email)
        setInfo('Email не подтверждён. Мы отправили код на ' + result.email)
        setMode('verify')
      } else if (result.user && result.token) {
        signIn(result.user, result.token)
      }
    } catch {
      setError('Ошибка при входе')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) { setError('Пароли не совпадают'); return }
    if (password.length < 6) { setError('Пароль: минимум 6 символов'); return }
    if (username.length < 3) { setError('Имя пользователя: минимум 3 символа'); return }
    setIsLoading(true)
    try {
      const result = await authAPI.register(username, email, password)
      if (result.error) setError(result.error)
      else if (result.needsVerification && result.email) {
        setPendingEmail(result.email)
        setInfo('Код подтверждения отправлен на ' + result.email)
        setMode('verify')
      } else if (result.user && result.token) {
        signIn(result.user, result.token)
      }
    } catch {
      setError('Ошибка при регистрации')
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const result = await authAPI.verifyEmail(pendingEmail, verifyCode)
      if (result.error) setError(result.error)
      else if (result.user && result.token) signIn(result.user, result.token)
    } catch {
      setError('Ошибка при проверке кода')
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const result = await authAPI.forgotPassword(forgotEmail)
      if (result.error) setError(result.error)
      else {
        setPendingEmail(forgotEmail)
        setInfo('Код для сброса пароля отправлен на ' + forgotEmail)
        setMode('reset')
      }
    } catch {
      setError('Ошибка при отправке кода')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirmNewPassword) { setError('Пароли не совпадают'); return }
    if (newPassword.length < 6) { setError('Пароль: минимум 6 символов'); return }
    setIsLoading(true)
    try {
      const result = await authAPI.resetPassword(pendingEmail, verifyCode, newPassword)
      if (result.error) setError(result.error)
      else {
        setInfo('Пароль успешно изменён. Войдите.')
        setVerifyCode('')
        setNewPassword('')
        setConfirmNewPassword('')
        setMode('login')
      }
    } catch {
      setError('Ошибка при сбросе пароля')
    } finally {
      setIsLoading(false)
    }
  }

  const switchMode = (m: Mode) => { setMode(m); setError(null); setInfo(null) }

  const inputCls = "bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:border-indigo-500 h-11 rounded-xl"
  const labelCls = "text-gray-300 text-sm font-normal"

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm px-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center mb-4 shadow-2xl shadow-indigo-500/40">
            <MessageCircle className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Messme</h1>
          <p className="text-gray-500 text-sm mt-1.5 flex items-center gap-1.5">
            <Lock className="h-3 w-3" />
            End-to-end encrypted
          </p>
        </div>

        {/* Mode tabs — only for login/register */}
        {(mode === 'login' || mode === 'register') && (
          <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-1 mb-5">
            <button
              onClick={() => switchMode('login')}
              className={cn('flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200',
                mode === 'login' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200')}
            >Войти</button>
            <button
              onClick={() => switchMode('register')}
              className={cn('flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200',
                mode === 'register' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200')}
            >Регистрация</button>
          </div>
        )}

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
          {info && <p className="text-indigo-400 text-sm bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2 mb-4">{info}</p>}

          {/* LOGIN */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label className={labelCls}>Имя или Email</Label>
                <Input value={loginField} onChange={e => setLoginField(e.target.value)}
                  placeholder="username или email" required className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label className={labelCls}>Пароль</Label>
                  <button type="button" onClick={() => switchMode('forgot')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                    Забыли пароль?
                  </button>
                </div>
                <Input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                  placeholder="••••••••" required className={inputCls} />
              </div>
              {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
              <Button type="submit" disabled={isLoading} className="w-full bg-indigo-600 hover:bg-indigo-500 h-11 rounded-xl font-medium transition-colors">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Войти'}
              </Button>
            </form>
          )}

          {/* REGISTER */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-1.5">
                <Label className={labelCls}>Имя пользователя</Label>
                <Input value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="минимум 3 символа" required minLength={3} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" required className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Пароль</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="минимум 6 символов" required minLength={6} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Подтверждение</Label>
                <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="повторите пароль" required className={inputCls} />
              </div>
              {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
              <Button type="submit" disabled={isLoading} className="w-full bg-indigo-600 hover:bg-indigo-500 h-11 rounded-xl font-medium transition-colors">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Создать аккаунт'}
              </Button>
            </form>
          )}

          {/* VERIFY EMAIL */}
          {mode === 'verify' && (
            <form onSubmit={handleVerify} className="space-y-4">
              <p className="text-gray-400 text-sm">Введите 6-значный код из письма</p>
              <div className="space-y-1.5">
                <Label className={labelCls}>Код подтверждения</Label>
                <Input value={verifyCode} onChange={e => setVerifyCode(e.target.value)}
                  placeholder="000000" required maxLength={6} inputMode="numeric" className={inputCls + " text-center text-xl tracking-[0.5em]"} />
              </div>
              {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
              <Button type="submit" disabled={isLoading} className="w-full bg-indigo-600 hover:bg-indigo-500 h-11 rounded-xl font-medium transition-colors">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Подтвердить'}
              </Button>
              <button type="button" onClick={() => switchMode('login')}
                className="w-full text-sm text-gray-500 hover:text-gray-300 transition-colors">
                ← Назад
              </button>
            </form>
          )}

          {/* FORGOT PASSWORD */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-4">
              <p className="text-gray-400 text-sm">Введите email — пришлём код для сброса пароля</p>
              <div className="space-y-1.5">
                <Label className={labelCls}>Email</Label>
                <Input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                  placeholder="you@example.com" required className={inputCls} />
              </div>
              {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
              <Button type="submit" disabled={isLoading} className="w-full bg-indigo-600 hover:bg-indigo-500 h-11 rounded-xl font-medium transition-colors">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Отправить код'}
              </Button>
              <button type="button" onClick={() => switchMode('login')}
                className="w-full text-sm text-gray-500 hover:text-gray-300 transition-colors">
                ← Назад
              </button>
            </form>
          )}

          {/* RESET PASSWORD */}
          {mode === 'reset' && (
            <form onSubmit={handleReset} className="space-y-4">
              <p className="text-gray-400 text-sm">Введите код из письма и новый пароль</p>
              <div className="space-y-1.5">
                <Label className={labelCls}>Код из письма</Label>
                <Input value={verifyCode} onChange={e => setVerifyCode(e.target.value)}
                  placeholder="000000" required maxLength={6} inputMode="numeric" className={inputCls + " text-center text-xl tracking-[0.5em]"} />
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Новый пароль</Label>
                <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="минимум 6 символов" required minLength={6} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Подтверждение</Label>
                <Input type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)}
                  placeholder="повторите пароль" required className={inputCls} />
              </div>
              {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
              <Button type="submit" disabled={isLoading} className="w-full bg-indigo-600 hover:bg-indigo-500 h-11 rounded-xl font-medium transition-colors">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Сменить пароль'}
              </Button>
              <button type="button" onClick={() => switchMode('login')}
                className="w-full text-sm text-gray-500 hover:text-gray-300 transition-colors">
                ← Назад
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
