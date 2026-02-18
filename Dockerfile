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
ENV LIBGL_ALWAYS_SOFTWARE=1
ENV GALLIUM_DRIVER=llvmpipe
ENV MEDIAPIPE_DISABLE_GPU=1
ENV CUDA_VISIBLE_DEVICES=-1
ENV EGL_PLATFORM=surfaceless
ENV LIBGL_ALWAYS_SOFTWARE=1
ENV GALLIUM_DRIVER=llvmpipe

RUN apt-get update && apt-get install -y --no-install-recommends \
  ffmpeg \
  python3 \
  python3-pip \
  libsndfile1 \
  python3-venv \
  libglib2.0-0 \
  libnss3 \
  libgl1-mesa-glx \
  libgl1-mesa-dri \
  libosmesa6 \
  curl \
  ca-certificates \
  unzip \
  && curl -fsSL https://deno.land/x/install/install.sh | sh \
  && ln -s /root/.deno/bin/deno /usr/local/bin/deno \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir --break-system-packages \
  numpy==1.24.3 \
  opencv-python-headless \
  protobuf==3.20.3 \
  mediapipe==0.10.9 \
  librosa

COPY src/python ./src/python

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY cookies.txt ./cookies.txt

COPY --from=build /app/dist-server ./dist-server
COPY tsconfig.runtime.json ./tsconfig.runtime.json
ENV TS_NODE_PROJECT=tsconfig.runtime.json

RUN mkdir -p /app/uploads/remote /app/uploads/clips /app/tmp/audio /app/tmp/subs

EXPOSE 8080
CMD ["node", "-r", "tsconfig-paths/register", "dist-server/server/index.js"]