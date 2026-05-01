'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid, Legend, Line, LineChart, Bar, BarChart,
  Area, AreaChart, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────

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

type AdminChannel = {
  id: string
  title: string | null
  isVerified: boolean
  avatarUrl: string | null
  createdAt: string
  ownerId: string | null
  ownerUsername: string | null
  subscribersCount: number
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
  newMessages24hCount: number
  adminUsersCount: number
  groupChatsCount: number
  personalChannelsCount: number
  gameModeChatsCount: number
  clipMeLikesCount: number
  clipMeViewsCount: number
  clipMeCommentsCount: number
  messageViewsCount: number
}

type TrendPoint = {
  day: string
  users: number
  messages: number
  stories: number
  clipmeVideos: number
}

type Tab = 'dashboard' | 'users' | 'channels' | 'metrics'

const PERIOD_OPTIONS = [
  { label: '7 дней', days: 7 },
  { label: '14 дней', days: 14 },
  { label: '30 дней', days: 30 },
]

const CHART_COLORS = {
  users: '#7fa2ff',
  messages: '#56d28f',
  stories: '#f3b462',
  clipmeVideos: '#ff7cc6',
  blocked: '#f87171',
  verified: '#34d399',
}

const PIE_COLORS = ['#7fa2ff', '#56d28f', '#f3b462', '#ff7cc6', '#a78bfa', '#f87171']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ─── StatCard ────────────────────────────────────────────────────────────────

function StatCard({ title, value, sub, accent }: { title: string; value: number | string; sub?: string; accent?: string }) {
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-1 ${accent ? 'border-transparent' : 'bg-white/[0.05] border-white/[0.08]'}`}
      style={accent ? { background: `${accent}18`, borderColor: `${accent}40` } : undefined}>
      <p className="text-xs text-white/55 font-medium">{title}</p>
      <p className="text-2xl font-bold tracking-tight">{typeof value === 'number' ? fmt(value) : value}</p>
      {sub && <p className="text-[11px] text-white/40">{sub}</p>}
    </div>
  )
}

// ─── Section header ──────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-white/90 mb-3">{children}</h2>
}

// ─── Custom tooltip ──────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-[#1a1d27] border border-white/10 px-3 py-2 text-xs shadow-xl">
      <p className="text-white/60 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-medium">
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── Tab nav ─────────────────────────────────────────────────────────────────

function TabNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: '📊 Дашборд' },
    { id: 'users', label: '👥 Пользователи' },
    { id: 'channels', label: '📡 Каналы' },
    { id: 'metrics', label: '📈 Метрики' },
  ]
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-white/[0.06] border border-white/[0.08] mb-6 overflow-x-auto">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
            active === t.id
              ? 'bg-[#4e7bff] text-white shadow-lg shadow-[#4e7bff]/25'
              : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ─── Dashboard tab ───────────────────────────────────────────────────────────

function DashboardTab({ stats, trends }: { stats: Stats; trends: TrendPoint[] }) {
  const [period, setPeriod] = useState(7)
  const [chartType, setChartType] = useState<'line' | 'bar' | 'area'>('area')
  const [visibleSeries, setVisibleSeries] = useState<Record<string, boolean>>({
    users: true, messages: true, stories: true, clipmeVideos: true,
  })

  const sliced = useMemo(() => trends.slice(-period), [trends, period])

  const toggleSeries = (key: string) => setVisibleSeries(prev => ({ ...prev, [key]: !prev[key] }))

  const seriesList = [
    { key: 'users', label: 'Пользователи', color: CHART_COLORS.users },
    { key: 'messages', label: 'Сообщения', color: CHART_COLORS.messages },
    { key: 'stories', label: 'Сторис', color: CHART_COLORS.stories },
    { key: 'clipmeVideos', label: 'ClipMe видео', color: CHART_COLORS.clipmeVideos },
  ]

  const pieData = [
    { name: 'Групп. чаты', value: stats.groupChatsCount },
    { name: 'Каналы', value: stats.personalChannelsCount },
    { name: 'Игр. комнаты', value: stats.gameModeChatsCount },
    { name: 'Личные чаты', value: Math.max(0, stats.chatsCount - stats.groupChatsCount - stats.personalChannelsCount - stats.gameModeChatsCount) },
  ]

  const clipPieData = [
    { name: 'Видео', value: stats.clipMeVideosCount },
    { name: 'Лайки', value: stats.clipMeLikesCount },
    { name: 'Просмотры', value: stats.clipMeViewsCount },
    { name: 'Коммент.', value: stats.clipMeCommentsCount },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard title="Пользователи" value={stats.usersCount} sub={`+${stats.newUsers24hCount} за 24ч`} accent="#7fa2ff" />
        <StatCard title="Сообщений" value={stats.messagesCount} sub={`+${stats.newMessages24hCount} за 24ч`} accent="#56d28f" />
        <StatCard title="Активные сессии" value={stats.activeSessionsCount} accent="#f3b462" />
        <StatCard title="ClipMe видео" value={stats.clipMeVideosCount} accent="#ff7cc6" />
        <StatCard title="Сторис" value={stats.storiesCount} accent="#a78bfa" />
      </div>

      <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-base font-semibold">Активность за период</h2>
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1 p-0.5 rounded-lg bg-white/[0.06]">
              {PERIOD_OPTIONS.map(opt => (
                <button key={opt.days} onClick={() => setPeriod(opt.days)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${period === opt.days ? 'bg-[#4e7bff] text-white' : 'text-white/55 hover:text-white'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 p-0.5 rounded-lg bg-white/[0.06]">
              {(['area', 'line', 'bar'] as const).map(t => (
                <button key={t} onClick={() => setChartType(t)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${chartType === t ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white'}`}>
                  {t === 'area' ? '▲' : t === 'line' ? '╌' : '▬'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {seriesList.map(s => (
            <button key={s.key} onClick={() => toggleSeries(s.key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all ${visibleSeries[s.key] ? 'text-white' : 'border-white/10 text-white/35'}`}
              style={visibleSeries[s.key] ? { background: `${s.color}25`, borderColor: `${s.color}60` } : undefined}>
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
              {s.label}
            </button>
          ))}
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={sliced}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="day" stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 11 }} />
                <YAxis stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 11 }} tickFormatter={fmt} />
                <Tooltip content={<CustomTooltip />} />
                {seriesList.filter(s => visibleSeries[s.key]).map(s => (
                  <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} />
                ))}
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart data={sliced}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="day" stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 11 }} />
                <YAxis stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 11 }} tickFormatter={fmt} />
                <Tooltip content={<CustomTooltip />} />
                {seriesList.filter(s => visibleSeries[s.key]).map(s => (
                  <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            ) : (
              <AreaChart data={sliced}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="day" stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 11 }} />
                <YAxis stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 11 }} tickFormatter={fmt} />
                <Tooltip content={<CustomTooltip />} />
                {seriesList.filter(s => visibleSeries[s.key]).map(s => (
                  <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} fill={`${s.color}18`} fillOpacity={1} strokeWidth={2} dot={false} />
                ))}
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-5">
          <SectionTitle>Типы чатов</SectionTitle>
          <div className="flex items-center gap-4">
            <div className="h-44 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmt(v)} contentStyle={{ background: '#1a1d27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 text-xs min-w-0">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-white/70">{d.name}</span>
                  <span className="font-semibold ml-auto pl-2">{fmt(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-5">
          <SectionTitle>ClipMe активность</SectionTitle>
          <div className="flex items-center gap-4">
            <div className="h-44 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={clipPieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3}>
                    {clipPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmt(v)} contentStyle={{ background: '#1a1d27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 text-xs min-w-0">
              {clipPieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-white/70">{d.name}</span>
                  <span className="font-semibold ml-auto pl-2">{fmt(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-5">
        <SectionTitle>Регистрации vs Сообщения (последние {period} дн.)</SectionTitle>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sliced} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="day" stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 11 }} />
              <YAxis stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 11 }} tickFormatter={fmt} />
              <Tooltip content={<CustomTooltip />} />
              <Legend formatter={(v: string) => v === 'users' ? 'Регистрации' : 'Сообщения'} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="users" name="users" fill={CHART_COLORS.users} radius={[3, 3, 0, 0]} />
              <Bar dataKey="messages" name="messages" fill={CHART_COLORS.messages} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ─── Users tab ───────────────────────────────────────────────────────────────

const BADGE_STYLES: Record<string, string> = {
  blue: 'bg-[#4e7bff]/20 text-[#7fa2ff] border border-[#4e7bff]/30',
  green: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  red: 'bg-red-500/15 text-red-300 border border-red-500/30',
  orange: 'bg-orange-500/15 text-orange-300 border border-orange-500/30',
  yellow: 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30',
  purple: 'bg-purple-500/15 text-purple-300 border border-purple-500/30',
  gray: 'bg-white/[0.06] text-white/50 border border-white/[0.1]',
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${BADGE_STYLES[color] ?? ''}`}>
      {children}
    </span>
  )
}

const BTN_STYLES: Record<string, string> = {
  blue: 'bg-[#4e7bff]/80 hover:bg-[#4e7bff] text-white',
  green: 'bg-emerald-600/80 hover:bg-emerald-600 text-white',
  red: 'bg-red-600/80 hover:bg-red-600 text-white',
  orange: 'bg-orange-500/80 hover:bg-orange-500 text-white',
  rose: 'bg-rose-700/80 hover:bg-rose-700 text-white',
  purple: 'bg-purple-600/80 hover:bg-purple-600 text-white',
}

function ActionBtn({ onClick, color, disabled, children }: {
  onClick: () => void; color: string; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${BTN_STYLES[color] ?? ''}`}>
      {children}
    </button>
  )
}

function UserRow({
  user, isSuspicious, onBlock, onVerify, onSetAdmin, onDelete, isDeleting, isPrimaryAdmin,
}: {
  user: AdminUser; isSuspicious: boolean
  onBlock: (id: string, v: boolean) => void
  onVerify: (id: string, v: boolean) => void
  onSetAdmin: (id: string, v: boolean) => void
  onDelete: (id: string) => void
  isDeleting: boolean; isPrimaryAdmin: boolean
}) {
  return (
    <div className={`rounded-2xl border p-4 flex flex-wrap gap-3 items-start transition-colors ${
      isSuspicious ? 'bg-yellow-500/5 border-yellow-500/20' : 'bg-white/[0.03] border-white/[0.07]'
    }`}>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="h-9 w-9 rounded-full bg-[#4e7bff]/25 flex items-center justify-center text-sm font-semibold text-[#7fa2ff] flex-shrink-0">
          {user.username.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{user.username}</p>
          <p className="text-xs text-white/45 truncate">{user.email}</p>
          <p className="text-[11px] text-white/30">{formatDate(user.createdAt)}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">
        {!user.isVerified && <Badge color="orange">Email не подтверждён</Badge>}
        {user.isBadgeVerified && <Badge color="blue">✔ Верифицирован</Badge>}
        {user.isBlocked && <Badge color="red">Заблокирован</Badge>}
        {user.isAdmin && <Badge color="green">🛡 Админ</Badge>}
        {isSuspicious && <Badge color="yellow">⚠️ Подозрительный</Badge>}
      </div>
      <div className="flex flex-wrap gap-1.5 items-center ml-auto">
        <ActionBtn onClick={() => onVerify(user.id, !user.isBadgeVerified)} color="blue">
          {user.isBadgeVerified ? 'Снять галочку' : 'Выдать галочку'}
        </ActionBtn>
        <ActionBtn onClick={() => onBlock(user.id, !user.isBlocked)} color={user.isBlocked ? 'green' : 'red'}>
          {user.isBlocked ? 'Разблокировать' : 'Заблокировать'}
        </ActionBtn>
        {isPrimaryAdmin && (
          <ActionBtn onClick={() => onSetAdmin(user.id, !user.isAdmin)} color={user.isAdmin ? 'orange' : 'purple'}>
            {user.isAdmin ? 'Снять админку' : 'Выдать админку'}
          </ActionBtn>
        )}
        <ActionBtn onClick={() => onDelete(user.id)} color="rose" disabled={isDeleting}>
          {isDeleting ? 'Удаление…' : 'Удалить'}
        </ActionBtn>
      </div>
    </div>
  )
}

function UsersTab({
  users, suspiciousAccounts, onBlock, onVerify, onSetAdmin, onDelete, deletingUserId, isPrimaryAdmin,
}: {
  users: AdminUser[]; suspiciousAccounts: AdminUser[]
  onBlock: (id: string, v: boolean) => void
  onVerify: (id: string, v: boolean) => void
  onSetAdmin: (id: string, v: boolean) => void
  onDelete: (id: string) => void
  deletingUserId: string | null; isPrimaryAdmin: boolean
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'blocked' | 'verified' | 'admins' | 'suspicious'>('all')

  const allUsers = useMemo(() => {
    const ids = new Set(users.map(u => u.id))
    return [...users, ...suspiciousAccounts.filter(u => !ids.has(u.id))]
  }, [users, suspiciousAccounts])

  const suspiciousIds = useMemo(() => new Set(suspiciousAccounts.map(u => u.id)), [suspiciousAccounts])

  const filtered = useMemo(() => {
    let list = allUsers
    if (filter === 'blocked') list = list.filter(u => u.isBlocked)
    else if (filter === 'verified') list = list.filter(u => u.isBadgeVerified)
    else if (filter === 'admins') list = list.filter(u => u.isAdmin)
    else if (filter === 'suspicious') list = list.filter(u => suspiciousIds.has(u.id))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(u => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    }
    return list
  }, [allUsers, filter, search, suspiciousIds])

  const filterOptions = [
    { id: 'all' as const, label: 'Все' },
    { id: 'suspicious' as const, label: '⚠️ Подозрительные' },
    { id: 'blocked' as const, label: '🚫 Заблок.' },
    { id: 'verified' as const, label: '✔ Верифиц.' },
    { id: 'admins' as const, label: '🛡 Админы' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по имени / email"
          className="h-9 flex-1 min-w-48 rounded-xl bg-white/[0.06] border border-white/[0.1] px-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-[#4e7bff]/60" />
        <div className="flex gap-1 flex-wrap">
          {filterOptions.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === f.id ? 'bg-[#4e7bff] text-white' : 'bg-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.1]'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-white/40">{filtered.length} из {allUsers.length}</p>
      {filtered.length === 0 && <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-6 text-white/50 text-sm text-center">Нет пользователей</div>}
      <div className="space-y-2">
        {filtered.map(user => (
          <UserRow key={user.id} user={user} isSuspicious={suspiciousIds.has(user.id)}
            onBlock={onBlock} onVerify={onVerify} onSetAdmin={onSetAdmin} onDelete={onDelete}
            isDeleting={deletingUserId === user.id} isPrimaryAdmin={isPrimaryAdmin} />
        ))}
      </div>
    </div>
  )
}

// ─── Channels tab ─────────────────────────────────────────────────────────────

function ChannelsTab({ channels, onVerify }: { channels: AdminChannel[]; onVerify: (id: string, v: boolean) => void }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'verified' | 'unverified'>('all')

  const filtered = useMemo(() => {
    let list = channels
    if (filter === 'verified') list = list.filter(c => c.isVerified)
    else if (filter === 'unverified') list = list.filter(c => !c.isVerified)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c => (c.title ?? '').toLowerCase().includes(q) || (c.ownerUsername ?? '').toLowerCase().includes(q))
    }
    return list
  }, [channels, filter, search])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию / владельцу"
          className="h-9 flex-1 min-w-48 rounded-xl bg-white/[0.06] border border-white/[0.1] px-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-[#4e7bff]/60" />
        {(['all', 'verified', 'unverified'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === f ? 'bg-[#4e7bff] text-white' : 'bg-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.1]'}`}>
            {f === 'all' ? 'Все' : f === 'verified' ? '✔ Верифицированные' : 'Не верифицированные'}
          </button>
        ))}
      </div>
      <p className="text-xs text-white/40">{filtered.length} из {channels.length}</p>
      {filtered.length === 0 && <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-6 text-white/50 text-sm text-center">Нет каналов</div>}
      <div className="space-y-2">
        {filtered.map(channel => (
          <div key={channel.id} className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-4 flex flex-wrap gap-3 items-center">
            <div className="h-9 w-9 rounded-full bg-[#4e7bff]/20 flex items-center justify-center text-sm font-semibold text-[#7fa2ff] flex-shrink-0">
              {(channel.title ?? '?').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate">{channel.title ?? '(без названия)'}</p>
              <p className="text-xs text-white/45">Владелец: {channel.ownerUsername ?? '—'} · {channel.subscribersCount} подписчиков</p>
              <p className="text-[11px] text-white/30">{formatDate(channel.createdAt)}</p>
            </div>
            <div className="flex items-center gap-2">
              {channel.isVerified ? <Badge color="blue">✔ Верифицирован</Badge> : <Badge color="gray">Не верифицирован</Badge>}
              <ActionBtn onClick={() => onVerify(channel.id, !channel.isVerified)} color="blue">
                {channel.isVerified ? 'Снять верификацию' : 'Верифицировать'}
              </ActionBtn>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Metrics tab ──────────────────────────────────────────────────────────────

function MetricsTab({ stats, trends }: { stats: Stats; trends: TrendPoint[] }) {
  const [period, setPeriod] = useState(7)
  const sliced = useMemo(() => trends.slice(-period), [trends, period])

  const userHealth = [
    { label: 'Всего пользователей', value: stats.usersCount, color: '#7fa2ff' },
    { label: 'Активные сессии', value: stats.activeSessionsCount, color: '#56d28f' },
    { label: 'Заблокированные', value: stats.blockedUsersCount, color: '#f87171' },
    { label: 'Верифицированные', value: stats.badgeVerifiedCount, color: '#34d399' },
    { label: 'Администраторы', value: stats.adminUsersCount, color: '#a78bfa' },
    { label: 'Новые за 24ч', value: stats.newUsers24hCount, color: '#fbbf24' },
  ]

  const contentMetrics = [
    { label: 'Сообщения', value: stats.messagesCount, sub: `+${stats.newMessages24hCount} сегодня` },
    { label: 'Просмотры сообщений', value: stats.messageViewsCount, sub: 'в каналах' },
    { label: 'Сторис', value: stats.storiesCount },
    { label: 'ClipMe видео', value: stats.clipMeVideosCount },
    { label: 'ClipMe просмотры', value: stats.clipMeViewsCount },
    { label: 'ClipMe лайки', value: stats.clipMeLikesCount },
    { label: 'ClipMe комментарии', value: stats.clipMeCommentsCount },
  ]

  const chatMetrics = [
    { label: 'Все чаты', value: stats.chatsCount },
    { label: 'Групповые чаты', value: stats.groupChatsCount },
    { label: 'Личные каналы', value: stats.personalChannelsCount },
    { label: 'Игровые комнаты', value: stats.gameModeChatsCount },
    { label: 'Личные переписки', value: Math.max(0, stats.chatsCount - stats.groupChatsCount - stats.personalChannelsCount - stats.gameModeChatsCount) },
  ]

  const engagementRate = stats.usersCount > 0 ? ((stats.activeSessionsCount / stats.usersCount) * 100).toFixed(1) : '0'
  const avgMsgPerUser = stats.usersCount > 0 ? (stats.messagesCount / stats.usersCount).toFixed(1) : '0'
  const avgClipViewsPerVideo = stats.clipMeVideosCount > 0 ? (stats.clipMeViewsCount / stats.clipMeVideosCount).toFixed(1) : '0'

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>Ключевые показатели</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard title="Вовлечённость (Сессии / Users)" value={`${engagementRate}%`} sub="активные сессии / всего" accent="#56d28f" />
          <StatCard title="Сообщений на пользователя" value={avgMsgPerUser} accent="#7fa2ff" />
          <StatCard title="Просмотров на ClipMe видео" value={avgClipViewsPerVideo} accent="#ff7cc6" />
        </div>
      </div>

      <div>
        <SectionTitle>Пользователи</SectionTitle>
        <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-5 space-y-3">
          {userHealth.map(m => (
            <div key={m.label} className="flex items-center gap-3">
              <span className="text-xs text-white/55 w-44 flex-shrink-0">{m.label}</span>
              <div className="flex-1 h-2 rounded-full bg-white/[0.08] overflow-hidden">
                <div className="h-full rounded-full" style={{
                  width: `${Math.min(100, stats.usersCount ? (m.value / stats.usersCount) * 100 : 0)}%`,
                  background: m.color,
                }} />
              </div>
              <span className="text-sm font-semibold w-16 text-right">{fmt(m.value)}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>Контент</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {contentMetrics.map(m => <StatCard key={m.label} title={m.label} value={m.value} sub={m.sub} />)}
        </div>
      </div>

      <div>
        <SectionTitle>Чаты</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {chatMetrics.map(m => <StatCard key={m.label} title={m.label} value={m.value} />)}
        </div>
      </div>

      <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <SectionTitle>Тренды сторис и ClipMe</SectionTitle>
          <div className="flex gap-1 p-0.5 rounded-lg bg-white/[0.06]">
            {PERIOD_OPTIONS.map(opt => (
              <button key={opt.days} onClick={() => setPeriod(opt.days)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${period === opt.days ? 'bg-[#4e7bff] text-white' : 'text-white/55 hover:text-white'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sliced}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="day" stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 11 }} />
              <YAxis stroke="rgba(255,255,255,0.35)" tick={{ fontSize: 11 }} tickFormatter={fmt} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="stories" name="Сторис" stroke={CHART_COLORS.stories} fill={`${CHART_COLORS.stories}20`} strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="clipmeVideos" name="ClipMe видео" stroke={CHART_COLORS.clipmeVideos} fill={`${CHART_COLORS.clipmeVideos}20`} strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminPanelPage() {
  const token = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('token') ?? ''
  }, [])

  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [suspiciousAccounts, setSuspiciousAccounts] = useState<AdminUser[]>([])
  const [personalChannels, setPersonalChannels] = useState<AdminChannel[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [trends, setTrends] = useState<TrendPoint[]>([])
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [isPrimaryAdmin, setIsPrimaryAdmin] = useState(false)

  const loadPanel = useCallback(async () => {
    if (!token) { setError('Токен не найден'); setLoading(false); return }
    setLoading(true); setError(null)
    const res = await fetch(`/api/admin/panel?token=${encodeURIComponent(token)}`)
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Ошибка загрузки'); setLoading(false); return }
    setStats(data.stats); setTrends(data.trends ?? [])
    setUsers(data.users ?? []); setSuspiciousAccounts(data.suspiciousAccounts ?? [])
    setPersonalChannels(data.personalChannels ?? [])
    setIsPrimaryAdmin(data.isPrimaryAdmin ?? false)
    setLoading(false)
  }, [token])

  useEffect(() => { void loadPanel() }, [loadPanel])

  const patchUser = (updated: AdminUser) => {
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
    setSuspiciousAccounts(prev => prev.map(u => u.id === updated.id ? updated : u))
  }

  const setBlocked = async (userId: string, blocked: boolean) => {
    const res = await fetch(`/api/admin/panel/users/${encodeURIComponent(userId)}/block`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, blocked }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Ошибка'); return }
    patchUser(data.user)
  }

  const setBadgeVerified = async (userId: string, verified: boolean) => {
    const res = await fetch(`/api/admin/panel/users/${encodeURIComponent(userId)}/verify`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, verified }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Ошибка'); return }
    patchUser(data.user)
  }

  const setAdminRole = async (userId: string, isAdmin: boolean) => {
    const res = await fetch(`/api/admin/panel/users/${encodeURIComponent(userId)}/set-admin`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, isAdmin }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Ошибка'); return }
    patchUser(data.user)
  }

  const deleteUser = async (userId: string) => {
    if (deletingUserId) return
    if (!window.confirm('Удалить профиль без возможности восстановления?')) return
    setDeletingUserId(userId)
    const res = await fetch(`/api/admin/panel/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Ошибка'); setDeletingUserId(null); return }
    setUsers(prev => prev.filter(u => u.id !== userId))
    setSuspiciousAccounts(prev => prev.filter(u => u.id !== userId))
    setDeletingUserId(null)
  }

  const setChannelVerified = async (channelId: string, verified: boolean) => {
    const res = await fetch(`/api/admin/panel/chats/${encodeURIComponent(channelId)}/verify`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, verified }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Ошибка'); return }
    setPersonalChannels(prev => prev.map(c => c.id === channelId ? { ...c, isVerified: verified } : c))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0e14] text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 mx-auto rounded-full border-2 border-[#4e7bff] border-t-transparent animate-spin" />
          <p className="text-white/60 text-sm">Загрузка панели…</p>
        </div>
      </div>
    )
  }
  if (error && !stats) {
    return (
      <div className="min-h-screen bg-[#0c0e14] text-white flex items-center justify-center">
        <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-6 text-center max-w-md">
          <p className="text-red-300 font-medium mb-1">Ошибка</p>
          <p className="text-white/60 text-sm">{error}</p>
        </div>
      </div>
    )
  }
  if (!stats) return null

  return (
    <div className="min-h-screen bg-[#0c0e14] text-white">
      <div className="border-b border-white/[0.07] bg-[#0c0e14]/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-lg bg-[#4e7bff] flex items-center justify-center text-xs font-bold">A</div>
            <span className="font-semibold text-sm">Messme Admin</span>
          </div>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-red-300 bg-red-500/10 px-2 py-1 rounded-lg">{error}</span>}
            <button onClick={loadPanel}
              className="text-xs text-white/50 hover:text-white px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] transition-all">
              ↻ Обновить
            </button>
            <a href="/"
              className="text-xs text-white/50 hover:text-white px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] transition-all">
              ← Мессенджер
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <TabNav active={activeTab} onChange={setActiveTab} />
        {activeTab === 'dashboard' && <DashboardTab stats={stats} trends={trends} />}
        {activeTab === 'users' && (
          <UsersTab users={users} suspiciousAccounts={suspiciousAccounts}
            onBlock={setBlocked} onVerify={setBadgeVerified} onSetAdmin={setAdminRole}
            onDelete={deleteUser} deletingUserId={deletingUserId} isPrimaryAdmin={isPrimaryAdmin} />
        )}
        {activeTab === 'channels' && <ChannelsTab channels={personalChannels} onVerify={setChannelVerified} />}
        {activeTab === 'metrics' && <MetricsTab stats={stats} trends={trends} />}
      </div>
    </div>
  )
}
