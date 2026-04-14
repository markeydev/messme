'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type AdminUser = {
  id: string
  username: string
  email: string
  avatarUrl: string | null
  isVerified: boolean
  isBadgeVerified: boolean
  isBlocked: boolean
  isAdmin: boolean
  createdAt: string
}

type Stats = {
  usersCount: number
  chatsCount: number
  messagesCount: number
  storiesCount: number
  clipMeVideosCount: number
  activeSessionsCount: number
  blockedUsersCount: number
  badgeVerifiedCount: number
  newUsers24hCount: number
  messme?: {
    chatsCount: number
    messagesCount: number
    storiesCount: number
    activeSessionsCount: number
  }
  clipme?: {
    clipMeVideosCount: number
  }
}

type TrendPoint = {
  day: string
  users: number
  messages: number
  stories: number
  clipmeVideos: number
}

export default function AdminPanelPage() {
  const token = useMemo(() => {
    if (typeof window === 'undefined') return ''
    const params = new URLSearchParams(window.location.search)
    return params.get('token') ?? ''
  }, [])

  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [suspiciousAccounts, setSuspiciousAccounts] = useState<AdminUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [trends, setTrends] = useState<TrendPoint[]>([])

  const loadPanel = useCallback(async () => {
    if (!token) {
      setError('Токен не найден')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const response = await fetch(`/api/admin/panel?token=${encodeURIComponent(token)}`)
    const data = await response.json()
    if (!response.ok) {
      setError(data.error ?? 'Ошибка загрузки панели')
      setLoading(false)
      return
    }
    setStats(data.stats)
    setTrends(data.trends ?? [])
    setUsers(data.users ?? [])
    setSuspiciousAccounts(data.suspiciousAccounts ?? [])
    setLoading(false)
  }, [token])

  useEffect(() => {
    void loadPanel()
  }, [loadPanel])

  const patchUserState = (updated: AdminUser) => {
    setUsers(prev => prev.map(u => (u.id === updated.id ? updated : u)))
    setSuspiciousAccounts(prev => prev.map(u => (u.id === updated.id ? updated : u)))
  }

  const setBlocked = async (userId: string, blocked: boolean) => {
    const response = await fetch(`/api/admin/panel/users/${encodeURIComponent(userId)}/block`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, blocked }),
    })
    const data = await response.json()
    if (!response.ok) {
      setError(data.error ?? 'Ошибка блокировки')
      return
    }
    patchUserState(data.user)
    void loadPanel()
  }

  const setBadgeVerified = async (userId: string, verified: boolean) => {
    const response = await fetch(`/api/admin/panel/users/${encodeURIComponent(userId)}/verify`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, verified }),
    })
    const data = await response.json()
    if (!response.ok) {
      setError(data.error ?? 'Ошибка верификации')
      return
    }
    patchUserState(data.user)
    void loadPanel()
  }

  if (loading) return <div className="min-h-screen bg-[#0f1014] text-white p-6">Загрузка панели…</div>
  if (error) return <div className="min-h-screen bg-[#0f1014] text-red-300 p-6">{error}</div>
  if (!stats) return <div className="min-h-screen bg-[#0f1014] text-white p-6">Нет данных</div>

  return (
    <main className="min-h-screen bg-[#0f1014] text-white p-6 md:p-8">
      <h1 className="text-2xl font-bold mb-6">Messme Admin Panel</h1>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <StatCard title="Пользователи" value={stats.usersCount} />
        <StatCard title="Чаты" value={stats.chatsCount} />
        <StatCard title="Сообщения" value={stats.messagesCount} />
        <StatCard title="Сторис" value={stats.storiesCount} />
        <StatCard title="ClipMe видео" value={stats.clipMeVideosCount} />
        <StatCard title="Активные сессии" value={stats.activeSessionsCount} />
        <StatCard title="Блокировки" value={stats.blockedUsersCount} />
        <StatCard title="С галочкой" value={stats.badgeVerifiedCount} />
        <StatCard title="Новые 24ч" value={stats.newUsers24hCount} />
      </section>

      <section className="mb-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-white/[0.05] border border-white/[0.08] p-4">
          <h2 className="text-base font-semibold mb-3">Динамика Messme</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="day" stroke="rgba(255,255,255,0.45)" />
                <YAxis stroke="rgba(255,255,255,0.45)" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="users" stroke="#7fa2ff" strokeWidth={2} />
                <Line type="monotone" dataKey="messages" stroke="#56d28f" strokeWidth={2} />
                <Line type="monotone" dataKey="stories" stroke="#f3b462" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl bg-white/[0.05] border border-white/[0.08] p-4">
          <h2 className="text-base font-semibold mb-3">Динамика ClipMe</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="day" stroke="rgba(255,255,255,0.45)" />
                <YAxis stroke="rgba(255,255,255,0.45)" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="clipmeVideos" stroke="#ff7cc6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="mb-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-white/[0.05] border border-white/[0.08] p-4">
          <h2 className="text-base font-semibold mb-3">Messme метрики</h2>
          <div className="grid grid-cols-2 gap-2">
            <StatCard title="Чаты" value={stats.messme?.chatsCount ?? stats.chatsCount} />
            <StatCard title="Сообщения" value={stats.messme?.messagesCount ?? stats.messagesCount} />
            <StatCard title="Сторис" value={stats.messme?.storiesCount ?? stats.storiesCount} />
            <StatCard title="Сессии" value={stats.messme?.activeSessionsCount ?? stats.activeSessionsCount} />
          </div>
        </div>
        <div className="rounded-xl bg-white/[0.05] border border-white/[0.08] p-4">
          <h2 className="text-base font-semibold mb-3">ClipMe метрики</h2>
          <div className="grid grid-cols-2 gap-2">
            <StatCard title="Видео" value={stats.clipme?.clipMeVideosCount ?? stats.clipMeVideosCount} />
            <StatCard title="Новые пользователи 24ч" value={stats.newUsers24hCount} />
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Подозрительные аккаунты</h2>
        <UsersTable users={suspiciousAccounts} onBlock={setBlocked} onVerify={setBadgeVerified} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Пользователи</h2>
        <UsersTable users={users} onBlock={setBlocked} onVerify={setBadgeVerified} />
      </section>
    </main>
  )
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/[0.06] border border-white/[0.08] p-4">
      <div className="text-xs text-white/60 mb-1">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  )
}

function UsersTable({
  users,
  onBlock,
  onVerify,
}: {
  users: AdminUser[]
  onBlock: (userId: string, blocked: boolean) => void
  onVerify: (userId: string, verified: boolean) => void
}) {
  if (!users.length) {
    return <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-4 text-white/60">Пусто</div>
  }
  return (
    <div className="rounded-xl border border-white/[0.08] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.06]">
            <tr>
              <th className="text-left px-3 py-2">Пользователь</th>
              <th className="text-left px-3 py-2">Статус</th>
              <th className="text-left px-3 py-2">Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="border-t border-white/[0.06]">
                <td className="px-3 py-2">
                  <div className="font-medium">{user.username}</div>
                  <div className="text-white/55 text-xs">{user.email}</div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-white/[0.08]">
                      {user.isVerified ? 'Email ok' : 'Email not verified'}
                    </span>
                    {user.isBadgeVerified && <span className="px-2 py-0.5 rounded-full bg-[#4e7bff]/35">✔ Верифицирован</span>}
                    {user.isBlocked && <span className="px-2 py-0.5 rounded-full bg-red-500/35">Заблокирован</span>}
                    {user.isAdmin && <span className="px-2 py-0.5 rounded-full bg-emerald-500/30">Админ</span>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => onVerify(user.id, !user.isBadgeVerified)}
                      className="px-2.5 py-1 rounded-lg bg-[#4e7bff] hover:bg-[#3d67e0]"
                    >
                      {user.isBadgeVerified ? 'Снять галочку' : 'Выдать галочку'}
                    </button>
                    <button
                      onClick={() => onBlock(user.id, !user.isBlocked)}
                      className={user.isBlocked ? 'px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500' : 'px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500'}
                    >
                      {user.isBlocked ? 'Разблокировать' : 'Заблокировать'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
