// src/server/ai/youtubeMetadataGenerator.ts
import OpenAI from "openai";
import type { QuoteReelTone, QuoteReelYoutubeMeta } from "@lib/jobsStore";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Channel persona per tone. This is what keeps titles/descriptions from sounding
// like generic AI motivation slop (the thing YouTube 2026 demonetizes). Each
// persona has a point of view and a way of speaking, so a whole channel feels
// like one creator instead of a content farm.
const TONE_PERSONA: Record<QuoteReelTone, string> = {
  aggressive:
    "A severe, no-excuses discipline mentor in the stoic / masculine self-improvement space. Confronts the viewer with uncomfortable truths. Speaks from concrete situations, never abstract fluff.",
  stoic:
    "A calm, grounded stoic voice. Detached, precise, unbothered. Frames discipline and self-mastery as quiet power, not hype.",
  cinematic:
    "A reflective, cinematic narrator. Slightly mysterious, weighty. Treats each idea like a scene with tension and a turn.",
  dark: "A blunt voice that names the dark, hidden dynamics people avoid: manipulation, betrayal, self-sabotage. Unsentimental, sharp.",
  emotional:
    "A warm, emotionally intelligent guide. Speaks to pain and healing with empathy, never preachy. Makes the viewer feel understood.",
  calm: "A soft, reassuring voice focused on peace, self-worth and slowing down. Gentle but with real substance.",
};

export type GenerateYoutubeMetadataInput = {
  tone: QuoteReelTone;
  /** Final narration script the video actually delivers. */
  script: string;
  /** The opening hook line of the video (title MUST stay faithful to this). */
  hook?: string;
  /** Original topic / niche prompt, when AI-generated. */
  topic?: string;
};

function coerceStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}

function normalizeHashtag(tag: string): string {
  const clean = tag.replace(/^#+/, "").replace(/[^a-zA-Z0-9_]/g, "");
  return clean ? `#${clean}` : "";
}

export async function generateYoutubeMetadata(
  input: GenerateYoutubeMetadataInput,
): Promise<QuoteReelYoutubeMeta> {
  const persona = TONE_PERSONA[input.tone] ?? TONE_PERSONA.stoic;

  const grounding = [
    input.hook ? `Opening hook the video actually delivers:\n"${input.hook}"` : "",
    input.topic ? `Topic / niche: ${input.topic}` : "",
    `Full narration script:\n${input.script}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.8,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You write YouTube metadata for a faceless vertical Shorts channel.

Channel persona: ${persona}

Your job is to maximize click-through and retention WITHOUT clickbait that the video fails to deliver.

Hard rules:
- "title": 1 primary title, max 70 characters. Curiosity- or benefit-driven. It MUST be faithful to the opening hook and the script — never promise something the video does not pay off. Title Case or natural casing, no ALL CAPS, no spammy symbols.
- "titleVariants": 2 alternative titles, same rules, genuinely different angles (not reworded duplicates).
- "description": YouTube description. Structure it as:
    line 1: a strong hook sentence containing the main keyword (the first ~100 chars show in search),
    then a blank line,
    then 1-2 sentences of value/context,
    then a blank line,
    then a short call to action to subscribe,
    then a line exactly: "🔗 Links: [add your links here]",
    then a final line with 3-5 hashtags.
- "tags": 10-15 lowercase search tags, a mix of broad and specific long-tail. No "#".
- "hashtags": exactly 3 hashtags, each starting with "#". The first must be "#shorts". Pick the 2 most relevant niche hashtags.
- "pinnedComment": one short question that invites viewers to comment (drives engagement).

Return STRICT JSON:
{"title": "...", "titleVariants": ["...","..."], "description": "...", "tags": ["..."], "hashtags": ["#shorts","#...","#..."], "pinnedComment": "..."}`,
      },
      {
        role: "user",
        content: `Tone: ${input.tone}\n\n${grounding}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("OpenAI returned empty content for YouTube metadata");

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("OpenAI returned non-JSON YouTube metadata");
  }

  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  if (!title) throw new Error("YouTube metadata is missing a title");

  const hashtags = coerceStringArray(parsed.hashtags, 3).map(normalizeHashtag).filter(Boolean);

  // Guarantee #shorts is present and first.
  const withShorts = ["#shorts", ...hashtags.filter((tag) => tag.toLowerCase() !== "#shorts")].slice(
    0,
    3,
  );

  return {
    title: title.slice(0, 100),
    titleVariants: coerceStringArray(parsed.titleVariants, 2),
    description: typeof parsed.description === "string" ? parsed.description.trim() : "",
    tags: coerceStringArray(parsed.tags, 15).map((tag) => tag.toLowerCase()),
    hashtags: withShorts,
    pinnedComment: typeof parsed.pinnedComment === "string" ? parsed.pinnedComment.trim() : undefined,
  };
}
