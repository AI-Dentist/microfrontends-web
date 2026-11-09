FROM node:24-bookworm-slim AS toolchain
RUN npm install --global pnpm@10.32.1
WORKDIR /workspace

FROM toolchain AS erp-build
WORKDIR /workspace/apps/mf-erp
COPY apps/mf-erp/package.json apps/mf-erp/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY apps/mf-erp/ ./
RUN pnpm run build

FROM toolchain AS shell-build
WORKDIR /workspace/apps/shell
COPY apps/shell/package.json apps/shell/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY apps/shell/ ./
COPY packages/mfe-contract/ /workspace/packages/mfe-contract/
RUN pnpm run build
COPY --from=erp-build /workspace/apps/mf-erp/dist/dental-erp-mfe1/browser/ /workspace/artifacts/erp/
COPY deploy/azure/write-platform-config.mjs /workspace/deploy/azure/write-platform-config.mjs
RUN node /workspace/deploy/azure/write-platform-config.mjs /workspace/artifacts/erp /workspace/apps/shell/dist/shell/browser

FROM nginx:1.28-alpine AS static
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1

FROM static AS shell-web
COPY deploy/azure/shell.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=shell-build /workspace/apps/shell/dist/shell/browser/ /usr/share/nginx/html/

FROM static AS mf-erp-web
COPY deploy/azure/erp.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=erp-build /workspace/apps/mf-erp/dist/dental-erp-mfe1/browser/ /usr/share/nginx/html/remotes/erp/
