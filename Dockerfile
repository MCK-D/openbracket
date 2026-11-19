FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
ENV HUSKY=0
RUN npm ci
COPY . .
RUN npx prisma generate
RUN SKIP_ENV_VALIDATION=true npm run build

FROM base AS runner
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid app app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Migration/seed CLIs are retained so the same image can initialize a demo environment.
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/scripts ./scripts
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/src ./src
COPY --from=build --chown=app:app /app/tests ./tests
COPY --from=build --chown=app:app /app/vitest.config.ts /app/tsconfig.json ./
USER app
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run db:seed && node server.js"]
