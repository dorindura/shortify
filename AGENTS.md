# AGENTS.md

This file is the project context for future AI/coding-agent conversations in this repo. Start here before exploring broadly.

## Non-Negotiable Security Rules

- Never open, read, edit, print, summarize, copy, rename, delete, or expose `.env` files.
- This includes `.env`, `.env.local`, `.env.development`, `.env.production`, `.env.test`, and any `.env.*` file.
- Never run commands that reveal environment variables, including `env`, `printenv`, or `echo $VARIABLE_NAME`.
- Use `.env.example` only if one exists.
- If a task needs a secret, mention only the variable name and ask for a safe placeholder value.
- Treat `cookies.txt` as sensitive browser/session material. Do not read or print it.
- Avoid inspecting generated user media in `uploads/` or `tmp/` unless the user explicitly asks and confirms it is safe.

## Project Identity

- Repo/package/deploy name: `shortify`.
- UI/product name currently shown to users: `Hookify`.
- Purpose: AI video repurposing into shorts, summaries, quote reels, and multi-source edits.

## High-Level Stack

- Next.js 16 App Router + React 19 frontend in `src/app` and `src/components`.
- Fastify backend in `src/server/index.ts`.
- BullMQ queue named `jobs`, backed by Redis.
- Supabase Auth, Postgres, and Storage.
- Stripe checkout, portal, and webhooks for Pro billing.
- OpenAI for transcription/scoring/caption/script generation.
- ElevenLabs for quote-reel voiceover and optional speech-to-text.
- ffmpeg, yt-dlp, Python, OpenCV, MediaPipe, and librosa for media processing.
- Docker/Fly.io for production API and worker processes.

## Main Runtime Flow

1. Frontend calls `NEXT_PUBLIC_API_BASE_URL` with Supabase bearer tokens.
2. Fastify route validates the bearer token through `src/server/auth/requireUser.ts`.
3. Route creates a `jobs` table row using `src/lib/jobsRepo.ts`.
4. Route enqueues only `{ jobId }` through `src/server/jobs/queue.ts`.
5. `src/server/jobs/workerRunner.ts` consumes BullMQ jobs and calls `processJob`.
6. `src/server/jobs/worker.ts` dispatches by `job_goal`.
7. Processing writes status/stage/progress and output paths back through `src/server/jobs/jobsDb.ts`.
8. Final media uploads to Supabase Storage bucket `shorts` under `jobs/{jobId}/...`.

## Job Types And Goals

- `shorts`: URL/upload source, AI clips or custom clip groups, caption drafts, face-aware smart crop, preview render, user review, final render. In custom mode, each custom clip can contain multiple time ranges that are stitched together into one short.
- `summary`: URL/upload source, AI-selected highlight ranges, concatenated summary, final render.
- `quote_reel`: manual text or AI prompt, script plan, bundled visual asset selection, optional voiceover, captions, final vertical render.
- `multi_source_edit`: selected ranges from up to 5 URLs, draft assembly, review overlays/effects/ending, final render.

The shared job types live in `src/lib/jobsStore.ts`.

## Important Files

- `src/app/page.tsx`: landing page.
- `src/app/dashboard/page.tsx`: authenticated dashboard entry.
- `src/components/home/HomePageClient.tsx`: main job creation/list/review client logic.
- `src/components/home/sections/CustomRangesEditor.tsx`: custom AI Shorts editor; each custom clip contains one or more ranges.
- `src/components/home/review/MultiSourceReviewPanel.tsx`: multi-source review panel using the same preview/overlays/ending/effects surface as AI Shorts, adapted to one assembled timeline.
- `src/server/index.ts`: Fastify app and route registration.
- `src/server/routes/url.ts`: create URL jobs.
- `src/server/routes/upload.ts`: create upload jobs.
- `src/server/routes/quoteReel.ts`: create quote-reel jobs.
- `src/server/routes/multiSourceEdit.ts`: create multi-source jobs.
- `src/server/routes/review.ts`: persist shorts review edits.
- `src/server/routes/render.ts`: final shorts render.
- `src/server/routes/multiSourceEditReview.ts`: persist multi-source review edits.
- `src/server/routes/multiSourceEditRender.ts`: final multi-source render.
- `src/server/routes/admin.ts`: admin overview/jobs/users endpoints.
- `src/server/jobs/worker.ts`: primary worker dispatcher for normal shorts/summary plus delegations.
- `src/server/jobs/processQuoteReelJob.ts`: quote-reel pipeline.
- `src/server/jobs/processMultiSourceEditJob.ts`: multi-source draft pipeline.
- `src/server/video/*`: ffmpeg, caption, audio, face crop, render, endings, and asset utilities.
- `src/server/billing/*`: Pro access and free-plan limits.
- `src/app/api/stripe/*`: Stripe checkout/portal/webhook.
- `Dockerfile`: production runtime image.
- `fly.toml`: Fly.io deployment with `api` and `worker` processes.

## Expected Supabase Objects

No database migrations are committed right now. Code assumes these exist:

- `jobs`
- `profiles`
- `usage_daily`
- `stripe_customers`
- `stripe_subscriptions`
- `job_assets`
- Storage bucket `shorts`

If schema changes are needed, update the TypeScript mappings in `src/lib/jobsRepo.ts`, `src/server/jobs/jobsDb.ts`, admin routes, billing helpers, and affected UI types together.

## Environment Variable Names

Only reference names, never values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL`
- `OPENAI_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO_MONTHLY`
- `ALLOWED_ORIGINS`
- `PORT`
- `WORKER_CONCURRENCY`
- `FFMPEG_THREADS`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_MODEL_ID`
- `ELEVENLABS_STT_MODEL_ID`
- `ELEVENLABS_OUTPUT_FORMAT`
- `ELEVENLABS_VOICE_DARK_MALE`
- `ELEVENLABS_VOICE_STORYTELLER`
- `ELEVENLABS_VOICE_SOFT_FEMALE`
- `ELEVENLABS_VOICE_MOTIVATIONAL_MALE`
- `ELEVENLABS_VOICE_NEUTRAL`
- `ELEVENLABS_VOICE_DEEP_MALE`
- `ELEVENLABS_VOICE_FEMALE`
- `ELEVENLABS_STABILITY`
- `ELEVENLABS_SIMILARITY`
- `ELEVENLABS_STYLE`
- `QUOTE_REEL_CAPTION_PRESET`
- `QUOTE_REEL_CAPTION_FONT`
- `QUOTE_REEL_CAPTION_OFFSET_SEC`
- `QUOTE_REEL_HIGHLIGHT_WORDS`
- `QUOTE_REEL_CAPTION_MAX_WORDS_PER_CHUNK`
- `QUOTE_REEL_CAPTION_CHUNK_BREAK_GAP_SEC`
- `QUOTE_REEL_CAPTION_MAX_CHUNK_DURATION_SEC`

## Commands

Install:

```bash
npm ci
```

Frontend:

```bash
npm run dev
```

Fastify API:

```bash
npm run dev:server
```

Worker:

```bash
npm run dev:worker
```

Checks:

```bash
npm run lint
npm run build
npm run build:server
```

Production server:

```bash
npm run start:server
```

## Deployment Notes

- `fly.toml` defines app `shortify-server` in region `ams`.
- Docker exposes port `8080`.
- Fly process `api` runs the Fastify server.
- Fly process `worker` runs `workerRunner`.
- `WORKER_CONCURRENCY` defaults to `1`.
- `FFMPEG_THREADS` defaults to `1`.
- Production cleanup only deletes local artifacts when `NODE_ENV === "production"` and refuses paths outside the project root.

## Generated Or Local-Only Paths

Do not treat these as source of truth:

- `uploads/`
- `tmp/`
- `public/shorts/`
- `public/thumbs/`
- `dist-server/`
- `.next/`
- `node_modules/`
- `supabase/.temp/`

The current worktree may contain untracked local runtime media under `uploads/` and `tmp/`; leave it untouched unless the user explicitly asks.

## Coding Guidance

- Prefer existing aliases from `tsconfig.json`: `@/*`, `@server/*`, `@lib/*`, `@components/*`, `@utils/*`.
- Use `src/lib/jobsStore.ts` as the canonical shared job type reference.
- Keep frontend job shape mappings aligned with Supabase row names in `src/lib/jobsRepo.ts`.
- Keep Fastify auth routes using bearer-token validation via Supabase.
- Queue payloads should remain small and idempotent; pass job ids, not full job objects.
- Be careful with paths that can be public asset URLs or local file paths; existing helpers often normalize `/shorts/...`, `/thumbs/...`, and `/assets/...`.
- Media changes need manual flow verification because no formal test suite exists yet.
- Do not refactor the whole media pipeline casually; it has many external runtime dependencies and filesystem assumptions.

## Known Gaps / Watch Points

- No committed Supabase migrations were found, so schema drift is a risk.
- No dedicated automated tests are configured.
- `Dockerfile` copies `cookies.txt`; this file is ignored and should be handled as sensitive local deployment material.
- Some naming still says Shortify while UI metadata/landing page says Hookify.
- `uploads/` and `tmp/` can become large and should stay out of git.
