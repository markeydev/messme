FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm install --save-dev tsx typescript @types/node

COPY index.ts tsconfig.json* ./

EXPOSE 3003
CMD ["npx", "tsx", "index.ts"]
