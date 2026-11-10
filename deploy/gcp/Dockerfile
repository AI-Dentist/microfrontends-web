FROM node:24-bookworm-slim AS builder
WORKDIR /app/apps/mf3-react-henry
COPY apps/mf3-react-henry/package*.json ./
RUN npm ci
COPY apps/mf3-react-henry/ ./
RUN npm run build:remote

FROM nginx:1.28-alpine
COPY deploy/gcp/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/mf3-react-henry/dist-remote/ /usr/share/nginx/html/remotes/clinical/
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
