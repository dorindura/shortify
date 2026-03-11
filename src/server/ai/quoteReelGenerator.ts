import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export const QUOTE_REEL_FOLDERS = [
  "dark_mystery",
  "emotional",
  "intellectual",
  "luxury_success",
  "nostalgic",
  "stoic",
  "surreal_art",
  "urban_lonely",
] as const;

export type QuoteReelAiPlan = {
  quote: string;
  author: string;
  instagramCaption: string;
  hashtags: string[];
  primaryFolder: string;
  fallbackFolder: string;
  musicSuggestion: {
    label: string;
    searchQuery: string;
    reason: string;
  }[];
};

function isValidFolder(folder: string) {
  return QUOTE_REEL_FOLDERS.includes(folder as any);
}

export async function generateQuoteReelPlan(input: {
  prompt: string;
  tone: string;
}): Promise<QuoteReelAiPlan> {
  const folderList = QUOTE_REEL_FOLDERS.join(", ");

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.7,
    response_format: { type: "json_object" },

    messages: [
      {
        role: "system",
        content: `
Create a viral motivational reel plan.

Rules:

Use REAL famous quotes only.
Do not invent quotes.
Do not invent authors.

Quote length:
8–26 words.

Choose ONE visual style folder from this list ONLY:

${folderList}

Do not invent new folder names.

Return 3 realistic sound suggestions creators search on TikTok.

Examples:

Little Dark Age slowed edit
Interstellar piano edit
Lux Aeterna cinematic edit
dramatic motivational speech
dark ambient phonk edit

Return JSON only.
`,
      },

      {
        role: "user",
        content: `
Theme: ${input.prompt}
Tone: ${input.tone}

Return JSON:

{
  "quote": "",
  "author": "",
  "instagramCaption": "",
  "hashtags": [],
  "primaryFolder": "",
  "fallbackFolder": "",
  "musicSuggestion": [
    {
      "label": "",
      "searchQuery": "",
      "reason": ""
    }
  ]
}
`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("OpenAI returned empty content");
  }

  const parsed = JSON.parse(content);

  const folder = isValidFolder(parsed.primaryFolder) ? parsed.primaryFolder : "stoic"; // fallback safe
  const fallbackFolder = isValidFolder(parsed.fallbackFolder) ? parsed.fallbackFolder : "stoic";

  return {
    quote: parsed.quote,
    author: parsed.author,
    instagramCaption: parsed.instagramCaption,
    hashtags: parsed.hashtags ?? [],
    primaryFolder: folder,
    fallbackFolder: fallbackFolder,
    musicSuggestion: parsed.musicSuggestion ?? [],
  };
}
