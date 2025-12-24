# ---------- build stage ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Install deps first (better caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Build server only
RUN npm run build:server


# ---------- runtime stage ----------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
  ffmpeg \
  python3 \
  && rm -rf /var/lib/apt/lists/*

# Install only production deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Bring built server output from build stage
COPY --from=build /app/dist-server ./dist-server

# ✅ runtime path mapping for aliases -> dist-server/*
COPY tsconfig.runtime.json ./tsconfig.runtime.json
ENV TS_NODE_PROJECT=tsconfig.runtime.json

RUN mkdir -p /app/uploads

EXPOSE 8080
CMD ["node", "-r", "tsconfig-paths/register", "dist-server/server/index.js"]
