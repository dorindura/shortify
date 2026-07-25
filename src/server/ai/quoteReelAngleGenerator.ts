// src/server/ai/quoteReelAngleGenerator.ts
import OpenAI from "openai";
import type { QuoteReelAngle, QuoteReelAngleSeed, QuoteReelTone } from "@lib/jobsStore";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// The variety engine. A channel that posts the same-shaped video every day gets
// flagged as mass-produced. We create variety deterministically by sampling
// across three independent dimensions, then let the model craft a specific
// angle for that exact combination. ~10 x 18 x 5 = 900 combinations, so a run of
// test videos from one niche comes out genuinely different but still on-brand.

const ANGLE_FORMATS: Array<{ id: string; brief: string }> = [
  { id: "hard_truth", brief: "a blunt, uncomfortable truth stated plainly" },
  { id: "contrarian", brief: "flips a common piece of advice on its head" },
  { id: "warning", brief: "warns that something comfortable is quietly destroying them" },
  { id: "signs", brief: "reveals the quiet signs that something is already true about them" },
  { id: "parable", brief: "a short scenario or story that lands a single lesson" },
  { id: "letter", brief: "spoken like a letter to a younger or future self" },
  { id: "question", brief: "opens with a haunting question they cannot unhear" },
  { id: "reframe", brief: "reframes a painful thing as a hidden source of power" },
  { id: "callout", brief: "calls out a specific behavior or type of person" },
  { id: "realization", brief: "captures the exact moment of a hard realization" },
];

const ANGLE_THEMES = [
  "discipline",
  "comfort",
  "fake friends",
  "loneliness",
  "wasting time",
  "ego",
  "silence",
  "self-respect",
  "betrayal",
  "overthinking",
  "seeking validation",
  "comparison",
  "healing",
  "letting go",
  "focus",
  "resentment",
  "raising your standards",
  "being underestimated",
];

const ANGLE_REGISTERS = [
  "confrontational",
  "reflective",
  "ominous",
  "empowering",
  "cold and detached",
];

function sample<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function formatBriefById(id: string): string {
  return ANGLE_FORMATS.find((format) => format.id === id)?.brief ?? id;
}

// Pick `count` angle seeds with distinct themes (and varied formats/registers),
// so a batch of reels never repeats the same theme. Falls back to repeats only
// if more reels are requested than there are themes.
export function pickDistinctAngleSeeds(count: number): QuoteReelAngleSeed[] {
  const themes = shuffle(ANGLE_THEMES);
  const formats = shuffle(ANGLE_FORMATS);

  return Array.from({ length: Math.max(1, count) }, (_unused, index) => ({
    angleFormat: formats[index % formats.length].id,
    theme: themes[index % themes.length],
    register: sample(ANGLE_REGISTERS),
  }));
}

export type GenerateQuoteReelAngleInput = {
  /** Broad niche / channel theme (e.g. "masculine self-discipline"). */
  niche: string;
  tone: QuoteReelTone;
  /** Pre-chosen seed (used for batch variety); random when omitted. */
  seed?: QuoteReelAngleSeed;
};

export async function generateQuoteReelAngle(
  input: GenerateQuoteReelAngleInput,
): Promise<QuoteReelAngle> {
  const formatId = input.seed?.angleFormat ?? sample(ANGLE_FORMATS).id;
  const theme = input.seed?.theme ?? sample(ANGLE_THEMES);
  const register = input.seed?.register ?? sample(ANGLE_REGISTERS);
  const format = { id: formatId, brief: formatBriefById(formatId) };

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.95,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You design a single, specific angle for one short vertical faceless video on a self-improvement channel.

You are given a niche and three constraints (format, theme, emotional register). Craft ONE angle that fits all three.

Rules:
- "premise": one sentence, the core idea of the video. Specific and concrete, never a generic slogan.
- "hook": the exact opening line the video should say first. It must stop the scroll in under 2 seconds and be anchored in a concrete situation, not an abstraction.
- "workingTitle": a short working title (max 60 chars) that stays faithful to the hook.
- No emojis. No hashtags. No quotation marks around the fields. Plain text.
- Match the emotional register precisely.
- Advertiser-friendly: no profanity, no slurs, no explicit sexual or violent content. Intensity must come from truth and tension, not vulgarity (this is for YouTube monetization).

Return STRICT JSON: {"premise": "...", "hook": "...", "workingTitle": "..."}`,
      },
      {
        role: "user",
        content: `Niche: ${input.niche || "self-improvement"}
Tone: ${input.tone}
Format: ${format.brief}
Theme: ${theme}
Emotional register: ${register}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("OpenAI returned empty content for angle");

  let parsed: { premise?: unknown; hook?: unknown; workingTitle?: unknown } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("OpenAI returned non-JSON angle");
  }

  const premise = typeof parsed.premise === "string" ? parsed.premise.trim() : "";
  const hook = typeof parsed.hook === "string" ? parsed.hook.trim() : "";

  if (!premise || !hook) throw new Error("Angle is missing premise or hook");

  return {
    angleFormat: format.id,
    theme,
    register,
    premise,
    hook,
    workingTitle:
      typeof parsed.workingTitle === "string" ? parsed.workingTitle.trim() : undefined,
  };
}

// Turn a niche + chosen angle into the enriched prompt the script generator
// consumes, so the script is shaped by the angle while still on-niche.
export function buildAnglePrompt(niche: string, angle: QuoteReelAngle): string {
  return [
    niche || "self-improvement",
    "",
    `Angle (${angle.angleFormat}, ${angle.register}) about ${angle.theme}.`,
    `Premise: ${angle.premise}`,
    `Open with a hook like: "${angle.hook}"`,
  ].join("\n");
}
