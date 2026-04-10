# --- Stage 1: install deps ---
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# --- Stage 2: build ---
FROM deps AS builder
WORKDIR /app

# Build-time public env vars (baked into Next.js client bundle)
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

ARG NEXT_PUBLIC_TURN_URL
ENV NEXT_PUBLIC_TURN_URL=$NEXT_PUBLIC_TURN_URL
ARG NEXT_PUBLIC_TURN_USERNAME
ENV NEXT_PUBLIC_TURN_USERNAME=$NEXT_PUBLIC_TURN_USERNAME
ARG NEXT_PUBLIC_TURN_PASSWORD
ENV NEXT_PUBLIC_TURN_PASSWORD=$NEXT_PUBLIC_TURN_PASSWORD

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run build

# --- Stage 3: production runner ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

# --- Stage 4: migrator (runs prisma migrate deploy, then exits) ---
FROM node:22-alpine AS migrator
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma

CMD ["node_modules/.bin/prisma", "migrate", "deploy"]
