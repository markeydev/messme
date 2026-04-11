# 🔐 Messenger с E2E Шифрованием

Полнофункциональный мессенджер с end-to-end шифрованием.

## ✨ Возможности

- 🔐 E2E шифрование (ECDH + AES-GCM)
- 💬 Личные и групповые чаты
- ⚡ WebSocket для real-time доставки
- 👥 Добавление участников в группы
- 🎨 Glassmorphism дизайн
- 📱 Адаптивный интерфейс

## 🛠 Технологии

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS 4 + shadcn/ui
- Prisma ORM + SQLite
- Socket.io (WebSocket)
- Web Crypto API (E2E)
- Zustand (State)

## 🚀 Запуск

```bash
# Установка
bun install

# База данных
bun run db:push

# WebSocket сервер (отдельный терминал)
cd mini-services/messenger-server && bun install && bun run dev

# Next.js (другой терминал)
bun run dev
```

Открыть: http://localhost:3000

## 🖥 Desktop client (Electron, Windows)

Desktop-клиент находится в отдельной папке:

```bash
cd electron-desktop
npm install
```

Локальный запуск (откроет `http://localhost:3000`, поэтому web-приложение должно быть запущено отдельно):

```bash
npm run dev
```

Сборка Windows-артефактов:

```bash
npm run build:win
```

Отдельные таргеты:

```bash
# Только portable
npm run build:win:portable

# Только installer (NSIS)
npm run build:win:installer
```

Готовые файлы появляются в `electron-desktop/dist`.

Для релиза в GitHub добавлен workflow `.github/workflows/electron-windows-release.yml`, который собирает Windows клиент и прикладывает артефакты к тегам `v*`.

## 📁 Структура

```
src/
├── app/api/          # API Routes
├── components/       # UI компоненты
├── lib/              # API, Socket, E2E, Store
└── hooks/            # React хуки
mini-services/
└── messenger-server/ # WebSocket сервер
prisma/
└── schema.prisma     # Database schema
```

## 🔐 E2E Шифрование

- Генерация ECDH ключей при регистрации
- Публичный ключ хранится на сервере
- Приватный ключ — только в localStorage клиента
- AES-GCM для шифрования сообщений

## 📡 WebSocket Events

- `auth` — аутентификация
- `join-chat` / `leave-chat` — комнаты
- `send-message` / `new-message` — сообщения
- `typing` / `user-typing` — индикатор набора
- `chat-created` / `new-chat` — создание чатов
- `members-added` — добавление участников

MIT License
