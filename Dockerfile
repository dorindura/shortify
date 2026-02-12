## ---------- build stage ----------
#FROM node:20-bookworm-slim AS build
#WORKDIR /app
#
## Install deps first (better caching)
#COPY package.json package-lock.json ./
#RUN npm ci
#
## Copy source
#COPY . .
#
## Build server only
#RUN npm run build:server
#
#
## ---------- runtime stage ----------
#FROM node:20-bookworm-slim AS runner
#WORKDIR /app
#ENV NODE_ENV=production
#
#RUN apt-get update && apt-get install -y --no-install-recommends \
#  ffmpeg \
#  python3 \
#  yt-dlp \
#  && rm -rf /var/lib/apt/lists/*
#
## Install only production deps
#COPY package.json package-lock.json ./
#RUN npm ci --omit=dev
#
## Bring built server output from build stage
#COPY --from=build /app/dist-server ./dist-server
#
## ✅ runtime path mapping for aliases -> dist-server/*
#COPY tsconfig.runtime.json ./tsconfig.runtime.json
#ENV TS_NODE_PROJECT=tsconfig.runtime.json
#
#RUN mkdir -p /app/uploads
#
#EXPOSE 8080
#CMD ["node", "-r", "tsconfig-paths/register", "dist-server/server/index.js"]


# ---------- build stage ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:server

# ---------- runtime stage ----------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Instalăm ffmpeg, python și ultima versiune de yt-dlp manual
RUN apt-get update && apt-get install -y --no-install-recommends \
  ffmpeg \
  python3 \
  curl \
  ca-certificates \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist-server ./dist-server
COPY tsconfig.runtime.json ./tsconfig.runtime.json
ENV TS_NODE_PROJECT=tsconfig.runtime.json

RUN mkdir -p /app/uploads/remote

EXPOSE 8080
CMD ["node", "-r", "tsconfig-paths/register", "dist-server/server/index.js"]