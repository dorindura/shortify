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

# If your pipeline uses ffmpeg / python, keep these.
# (If you confirm you don't need python/ffmpeg in prod, remove them.)
RUN apt-get update && apt-get install -y --no-install-recommends \
  ffmpeg \
  python3 \
  && rm -rf /var/lib/apt/lists/*

# Install only production deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Bring built server output
COPY --from=build /app/dist-server ./dist-server

# Create uploads dir (and optionally mount a Fly volume here)
RUN mkdir -p /app/uploads

EXPOSE 8080
CMD ["node", "dist-server/server/index.js"]
