# ---------- build stage ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:server

## ---------- runtime stage ----------
#FROM node:20-bookworm-slim AS runner
#WORKDIR /app
#ENV NODE_ENV=production
#
## Instalăm dependențele și adăugăm un runtime JS (deno este foarte bine suportat de yt-dlp)
#RUN apt-get update && apt-get install -y --no-install-recommends \
#  ffmpeg \
#  python3 \
#  curl \
#  ca-certificates \
#  unzip \
#  && curl -fsSL https://deno.land/x/install/install.sh | sh \
#  && ln -s /root/.deno/bin/deno /usr/local/bin/deno \
#  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
#  && chmod a+rx /usr/local/bin/yt-dlp \
#  && rm -rf /var/lib/apt/lists/*

# ---------- runtime stage ----------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
  ffmpeg \
  python3 \
  python3-pip \
  python3-venv \
  libgl1-mesa-glx \
  libglib2.0-0 \
  curl \
  ca-certificates \
  unzip \
  && curl -fsSL https://deno.land/x/install/install.sh | sh \
  && ln -s /root/.deno/bin/deno /usr/local/bin/deno \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir --break-system-packages \
  opencv-python-headless \
  mediapipe

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY cookies.txt ./cookies.txt

COPY --from=build /app/dist-server ./dist-server
COPY tsconfig.runtime.json ./tsconfig.runtime.json
ENV TS_NODE_PROJECT=tsconfig.runtime.json

RUN mkdir -p /app/uploads/remote /app/uploads/clips /app/tmp/audio /app/tmp/subs

EXPOSE 8080
CMD ["node", "-r", "tsconfig-paths/register", "dist-server/server/index.js"]