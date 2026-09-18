# syntax=docker/dockerfile:1
# Build context: repository root (needed for npm workspaces and shared/).
# Targets: `dev` (tsx watch, hot reload) and `prod` (compiled JS, prod deps only).

ARG NODE_IMAGE=node:20-alpine

# --- base: non-root workdir owned by the built-in `node` user ----------------
FROM ${NODE_IMAGE} AS base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false
WORKDIR /app
RUN chown node:node /app
USER node

# --- manifests: workspace package.json files + lockfile ----------------------
FROM base AS manifests
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node shared/package.json shared/
COPY --chown=node:node backend/package.json backend/
COPY --chown=node:node frontend/package.json frontend/

# --- deps: all dependencies of backend + shared ------------------------------
FROM manifests AS deps
RUN npm ci --workspace=backend --workspace=shared \
    && mkdir -p backend/node_modules

# --- dev: source is bind-mounted over /app/backend and /app/shared ----------
FROM deps AS dev
ENV NODE_ENV=development
COPY --chown=node:node tsconfig.base.json ./
COPY --chown=node:node shared ./shared
COPY --chown=node:node backend ./backend
WORKDIR /app/backend
EXPOSE 4000
CMD ["sh", "-c", "npm run migrate && exec npm run dev"]

# --- build: compile shared and backend ---------------------------------------
FROM deps AS build
COPY --chown=node:node tsconfig.base.json ./
COPY --chown=node:node shared ./shared
COPY --chown=node:node backend ./backend
RUN npm run build --workspace=shared && npm run build --workspace=backend

# --- prod-deps: production dependencies only ---------------------------------
FROM manifests AS prod-deps
RUN npm ci --omit=dev --workspace=backend --workspace=shared \
    && mkdir -p backend/node_modules \
    && npm cache clean --force

# --- prod: compiled output + production node_modules -------------------------
FROM ${NODE_IMAGE} AS prod
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/package.json ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/shared/package.json ./shared/
COPY --from=build --chown=node:node /app/shared/dist ./shared/dist
COPY --from=prod-deps --chown=node:node /app/backend/package.json ./backend/
COPY --from=prod-deps --chown=node:node /app/backend/node_modules ./backend/node_modules
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
USER node
WORKDIR /app/backend
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["sh", "-c", "node dist/database/migrate.js && exec node dist/server.js"]
