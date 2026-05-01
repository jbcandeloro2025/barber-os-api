# Build stage
FROM node:20-slim AS builder
WORKDIR /app

# Instala dependências necessárias para o Prisma e detecção de pacotes
RUN apt-get update -y && apt-get install -y openssl

# Copiar arquivos de pacotes
COPY package.json pnpm-lock.yaml* yarn.lock* package-lock.json* ./
COPY prisma ./prisma/

# Instalar dependências baseado no package manager
RUN \
  if [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --no-frozen-lockfile; \
  elif [ -f yarn.lock ]; then yarn install; \
  elif [ -f package-lock.json ]; then npm install; \
  else npm install; \
  fi

# Copiar código fonte
COPY . .

# Criar pasta de uploads para evitar erro no fastify-static
RUN mkdir -p uploads

# Copiar código fonte, gerar Prisma e fazer build
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:20-slim AS runner
WORKDIR /app

# Instala openssl na imagem final (essencial para o Prisma)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copiar apenas o necessário do build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
RUN mkdir -p uploads

EXPOSE 3333

# Comando para iniciar a API
CMD ["npm", "start"]
