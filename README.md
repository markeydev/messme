# ✨ Messme (Тестовый стенд: [MESSME](https://aty-market.ru) )

Современная коммуникационная платформа: безопасный мессенджер, игровые чаты с голосовыми каналами, stories и лента коротких видео ClipMe — в одном приложении.

## 🚀 Что внутри

- 🔐 Безопасный обмен сообщениями (клиентское шифрование + серверное AES-256-GCM хранение)
- 💬 Личные и групповые чаты в real-time (Socket.IO)
- 🔎 Поиск по сообщениям внутри чата (server API + UI)
- 📌 Закреп чатов и сообщений
- 🗂 Архив/разархивирование чатов
- ⭐ Избранные сообщения (персонально)
- 🎮 Game/Play mode: роли, каналы, голосовые комнаты и WebRTC-звонки
- 📸 Stories (24 часа): просмотр, лайки, статистика
- 🎬 ClipMe: короткие видео, лайки, комментарии, репосты, подписки
- 🔔 Push-уведомления и desktop-интеграция (Electron)
- 🧾 Управление сессиями: список, завершение одной, завершение всех кроме текущей

## 🧱 Технологический стек

- **Frontend:** Next.js 16, React 19, TypeScript
- **UI:** Tailwind CSS 4, Radix UI, shadcn/ui
- **State/Data:** Zustand, TanStack Query
- **Backend (API):** Next.js Route Handlers
- **Realtime:** Socket.IO (`mini-services/messenger-server`)
- **DB:** PostgreSQL + Prisma
- **Storage:** S3-совместимое хранилище
- **Desktop:** Electron (Windows build)

## ⚡ Быстрый старт (локально)

### 1) Установка зависимостей

```bash
npm install
npm --prefix mini-services/messenger-server install
```

### 2) Переменные окружения

```bash
cp .env.example .env
```

Заполни обязательные значения в `.env` (минимум `DATABASE_URL`, `SECRET_KEY`, `MESSAGE_ENCRYPTION_KEY` и параметры S3).

Для realtime presence через Redis (опционально в локальной разработке, используется в Docker):

```env
REDIS_URL=redis://localhost:6379
```

### 3) Подними PostgreSQL

```bash
docker compose up -d postgres
```

### 4) Применение схемы Prisma

```bash
npm run db:push
```

### 5) Запуск сервисов

В первом терминале:

```bash
npm run dev
```

Во втором терминале:

```bash
npm run dev --prefix mini-services/messenger-server
```

Открой: **http://localhost:3000**

## 🐳 Запуск через Docker Compose

Для production-окружения используется `docker-compose.yml` (app + ws + postgres + redis + migrate + coturn).

```bash
docker compose up -d --build
```

## 🖥 Desktop-клиент (Electron)

```bash
cd electron-desktop
npm install
npm run dev
```

Сборка Windows:

```bash
npm run build:win
```

Артефакты: `electron-desktop/dist`.

## 📁 Структура проекта

```text
src/
├─ app/                    # Next.js app + API routes
├─ components/messenger/   # UI мессенджера, звонки, ClipMe, игровые окна
├─ hooks/                  # клиентские хуки
└─ lib/                    # api, socket, crypto, store и утилиты

mini-services/
└─ messenger-server/       # Socket.IO realtime сервер

prisma/
└─ schema.prisma           # модели БД

electron-desktop/          # desktop-клиент
```

## 🔧 Основные npm-скрипты

```bash
npm run dev
npm run build
npm run start
npm run db:push
npm run db:migrate
```

## 📄 Лицензия

MIT
