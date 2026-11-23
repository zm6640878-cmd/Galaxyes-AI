# Multi-stage Dockerfile for Google Cloud Run deployment
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json bun.lock* package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV DATABASE_PATH=/app/data/glaxyes.db

RUN addgroup -S glaxyes && adduser -S glaxyes -G glaxyes

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server

RUN mkdir -p /app/data && chown -R glaxyes:glaxyes /app/data

USER glaxyes
EXPOSE 8080

CMD ["npm", "start"]
