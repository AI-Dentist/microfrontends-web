FROM node:24-bookworm-slim AS builder
WORKDIR /app/apps/mf2-vue-wendy
COPY apps/mf2-vue-wendy/package*.json ./
RUN npm ci
COPY apps/mf2-vue-wendy/ ./
RUN npm run build:remote

FROM nginx:1.28-alpine
COPY deploy/aws/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/mf2-vue-wendy/dist-remote/ /usr/share/nginx/html/remotes/operations/
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1
