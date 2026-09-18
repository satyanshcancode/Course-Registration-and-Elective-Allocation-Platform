# syntax=docker/dockerfile:1
# Build context: repository root (needed for npm workspaces and shared/).
# Targets: `dev` (Vite dev server, hot reload) and `prod` (static build on nginx).

ARG NODE_IMAGE=node:20-alpine

# --- base: non-root workdir owned by the built-in `node` user ----------------
FROM ${NODE_IMAGE} AS base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false
WORKDIR /app
RUN chown node:node /app
USER node

# --- deps: all dependencies of frontend + shared -----------------------------
FROM base AS deps
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node shared/package.json shared/
COPY --chown=node:node backend/package.json backend/
COPY --chown=node:node frontend/package.json frontend/
RUN npm ci --workspace=frontend --workspace=shared \
    && mkdir -p frontend/node_modules

# --- dev: source is bind-mounted over /app/frontend and /app/shared ----------
FROM deps AS dev
COPY --chown=node:node tsconfig.base.json ./
COPY --chown=node:node shared ./shared
COPY --chown=node:node frontend ./frontend
WORKDIR /app/frontend
EXPOSE 5173
CMD ["npm", "run", "dev"]

# --- build: type-check and bundle --------------------------------------------
FROM deps AS build
COPY --chown=node:node tsconfig.base.json ./
COPY --chown=node:node shared ./shared
COPY --chown=node:node frontend ./frontend
RUN npm run build --workspace=frontend

# --- prod: static files on unprivileged nginx (runs as non-root, port 8080) --
FROM nginxinc/nginx-unprivileged:1.27-alpine AS prod
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
    CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
