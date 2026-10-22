FROM node:22.23.4-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
RUN rm -rf dist *.tsbuildinfo && npm run build && npm prune --omit=dev

# Keeps Prisma CLI (devDependency) for `prisma migrate deploy`.
FROM deps AS migrate
COPY --from=build --chown=node:node /app/prisma ./prisma
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# Default / final stage: API and worker runtime image.
FROM base AS runner
ENV NODE_ENV=production
USER node
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/prisma ./prisma
# Workspace package is symlinked from node_modules/@quantia/contracts
COPY --from=build --chown=node:node /app/packages/contracts ./packages/contracts
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
