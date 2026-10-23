# Etapa 1: compila o webchat e o console do atendente (React + Vite).
FROM node:24-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web ./web
RUN npx vite build web

# Etapa 2: só as dependências de produção. O Node 24 executa o TypeScript direto (type stripping).
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src ./src
COPY --from=web /app/web/dist ./web/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "src/server.ts"]
