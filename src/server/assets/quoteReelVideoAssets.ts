// src/server/assets/quoteReelVideoAssets.ts
import fs from "fs/promises";
import path from "path";
import type { QuoteReelAssetPick, QuoteReelSegment } from "@lib/jobsStore";

const VIDEO_ROOT = path.join(process.cwd(), "public", "assets", "videos");

const ALLOWED_EXT = new Set([".mp4", ".mov", ".webm"]);

export type QuoteReelVideoAsset = {
  assetPath: string;
  relativePath: string;
  categoryPath: string;
  filename: string;
};

type PickAssetsInput = {
  segments: QuoteReelSegment[];
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

async function walkVideoFiles(dir: string): Promise<string[]> {
  let dirents: Array<import("fs").Dirent> = [];

  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: string[] = [];

  for (const dirent of dirents) {
    const absPath = path.join(dir, dirent.name);

    if (dirent.isDirectory()) {
      const nested = await walkVideoFiles(absPath);
      results.push(...nested);
      continue;
    }

    if (!dirent.isFile()) continue;

    const ext = path.extname(dirent.name).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) continue;

    results.push(absPath);
  }

  return results;
}

function toCategoryPath(absPath: string): string {
  const relative = path.relative(VIDEO_ROOT, absPath);
  const parts = relative.split(path.sep);

  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

export async function listQuoteReelVideoAssets(): Promise<
  QuoteReelVideoAsset[]
> {
  const files = await walkVideoFiles(VIDEO_ROOT);

  return files.map((assetPath) => ({
    assetPath,
    relativePath: path.relative(VIDEO_ROOT, assetPath).split(path.sep).join(
      "/",
    ),
    categoryPath: toCategoryPath(assetPath),
    filename: path.basename(assetPath),
  }));
}

const VISUAL_TAG_CATEGORY_MAP: Record<string, string[]> = {
  alone: [
    "characters/alone",
    "social_situations/loneliness_in_crowd",
    "symbolic/window",
  ],
  anger: [
    "emotions/angry",
    "energy/intense",
    "characters/fight",
    "actions/reacting",
  ],
  anxiety: [
    "emotions/anxiety",
    "characters/staring",
    "scenes_by_context/room",
    "symbolic/rain",
  ],
  arriving: [
    "actions/arriving",
    "scenes_by_context/street",
    "scenes_by_context/public_transport",
  ],
  attention: [
    "hooks/attention",
    "characters/staring",
    "actions/observing",
  ],
  awkward: [
    "social_situations/awkward_moments",
    "social_situations/being_judged",
  ],
  bond: [
    "energy/bond",
    "social_situations/friendship",
    "characters/duo",
  ],
  calm: [
    "energy/calm",
    "emotions/peace",
    "symbolic/sky",
    "symbolic/ocean",
  ],
  chaos: [
    "energy/chaos",
    "emotions/angry",
    "hooks/shocking",
  ],
  city_night: [
    "symbolic/city_night",
    "symbolic/shadows",
    "scenes_by_context/street",
  ],
  confidence: [
    "emotions/confidence",
    "characters/walking",
    "characters/faceless",
  ],
  curiosity: [
    "hooks/curiosity",
    "actions/observing",
    "characters/thinking",
  ],
  dark: [
    "symbolic/shadows",
    "symbolic/city_night",
    "symbolic/rain",
  ],
  duo: [
    "characters/duo",
    "social_situations/friendship",
    "social_situations/being_included",
  ],
  emotional: [
    "hooks/emotional",
    "emotions/sadness",
    "symbolic/rain",
  ],
  empathy: [
    "emotions/empathy",
    "actions/helping",
    "social_situations/friendship",
  ],
  faceless: [
    "characters/faceless",
    "symbolic/silhouettes",
    "symbolic/shadows",
  ],
  fire: [
    "symbolic/fire",
    "energy/intense",
    "hooks/shocking",
  ],
  forgiveness: [
    "emotions/peace",
    "emotions/empathy",
    "actions/listening",
    "symbolic/sunrise",
  ],
  friendship: [
    "social_situations/friendship",
    "characters/duo",
    "social_situations/being_included",
  ],
  group: [
    "characters/group",
    "social_situations/group_dynamics",
    "social_situations/being_included",
  ],
  healing: [
    "emotions/peace",
    "symbolic/sunrise",
    "symbolic/sky",
    "symbolic/ocean",
  ],
  hope: [
    "symbolic/sunrise",
    "symbolic/sky",
    "emotions/confidence",
  ],
  ignoring: [
    "actions/ignoring",
    "social_situations/being_judged",
  ],
  included: [
    "social_situations/being_included",
    "social_situations/friendship",
    "characters/group",
  ],
  intense: [
    "energy/intense",
    "hooks/shocking",
    "characters/fight",
  ],
  judged: [
    "social_situations/being_judged",
    "social_situations/group_dynamics",
    "characters/group",
  ],
  kindness: [
    "emotions/kindness",
    "actions/helping",
    "emotions/empathy",
  ],
  leaving: [
    "actions/leaving",
    "characters/walking",
    "scenes_by_context/street",
  ],
  listening: [
    "actions/listening",
    "characters/duo",
    "actions/helping",
  ],
  loneliness: [
    "emotions/loneliness",
    "characters/alone",
  ],
  love: [
    "emotions/love",
    "social_situations/friendship",
    "characters/duo",
  ],
  movement: [
    "characters/walking",
    "characters/stepping",
    "actions/arriving",
  ],
  nostalgia: [
    "emotions/nostalgia",
    "symbolic/sunset",
    "symbolic/window",
  ],
  observing: [
    "actions/observing",
    "characters/staring",
    "characters/thinking",
  ],
  ocean: [
    "symbolic/ocean",
    "emotions/peace",
  ],
  pain: [
    "emotions/sadness",
    "emotions/anxiety",
    "symbolic/rain",
    "symbolic/window",
  ],
  peace: [
    "emotions/peace",
    "symbolic/sky",
    "symbolic/ocean",
    "symbolic/sunrise",
  ],
  protecting: [
    "actions/protecting",
    "actions/helping",
    "characters/duo",
  ],
  rain: [
    "symbolic/rain",
    "emotions/sadness",
    "symbolic/window",
  ],
  reacting: [
    "actions/reacting",
    "hooks/shocking",
    "characters/staring",
  ],
  reflection: [
    "characters/thinking",
    "symbolic/window",
    "scenes_by_context/room",
    "characters/staring",
  ],
  regret: [
    "emotions/sadness",
    "characters/thinking",
    "symbolic/rain",
  ],
  resilience: [
    "emotions/confidence",
    "characters/walking",
    "symbolic/sunrise",
  ],
  room: [
    "scenes_by_context/room",
    "characters/sitting",
    "characters/thinking",
  ],
  sadness: [
    "emotions/sadness",
    "symbolic/rain",
    "characters/alone",
  ],
  self_respect: [
    "emotions/confidence",
    "characters/faceless",
    "characters/walking",
    "symbolic/shadows",
  ],
  shadows: [
    "symbolic/shadows",
    "symbolic/city_night",
    "symbolic/silhouettes",
  ],
  shock: [
    "hooks/shocking",
    "actions/reacting",
    "energy/chaos",
  ],
  silhouette: [
    "symbolic/silhouettes",
    "characters/faceless",
    "symbolic/shadows",
  ],
  sky: [
    "symbolic/sky",
    "symbolic/sunrise",
    "symbolic/sunset",
  ],
  slow_motion: [
    "symbolic/silhouettes",
    "characters/walking",
  ],
  stars: [
    "symbolic/stars",
    "symbolic/sky",
    "symbolic/city_night",
  ],
  stoic: [
    "characters/faceless",
    "characters/thinking",
    "symbolic/shadows",
    "symbolic/window",
  ],
  street: [
    "scenes_by_context/street",
    "characters/walking",
    "actions/arriving",
  ],
  strength: [
    "emotions/confidence",
    "energy/intense",
    "characters/walking",
  ],
  sunrise: [
    "symbolic/sunrise",
    "symbolic/sky",
    "emotions/peace",
  ],
  sunset: [
    "symbolic/sunset",
    "emotions/nostalgia",
    "symbolic/sky",
  ],
  thinking: [
    "characters/thinking",
    "characters/staring",
    "symbolic/window",
    "scenes_by_context/room",
  ],
  walking: [
    "characters/walking",
    "characters/stepping",
    "scenes_by_context/street",
  ],
  window: [
    "symbolic/window",
    "scenes_by_context/room",
    "characters/thinking",
  ],
};

const DEFAULT_CATEGORY_FALLBACKS = [
  "characters/thinking",
  "characters/walking",
  "scenes_by_context/street",
  "symbolic/window",
  "symbolic/sky",
  "actions/observing",
];

function getCandidateCategoriesForTag(tag: string): string[] {
  return VISUAL_TAG_CATEGORY_MAP[tag] ?? [];
}

function getCandidateCategoriesForSegment(segment: QuoteReelSegment): string[] {
  const ordered: string[] = [];

  for (const tag of segment.visualTags ?? []) {
    ordered.push(...getCandidateCategoriesForTag(tag));
  }

  if (segment.type === "hook") {
    ordered.unshift("hooks/attention", "hooks/curiosity", "hooks/shocking");
  }

  if (segment.type === "cta") {
    ordered.unshift("symbolic/sunrise", "symbolic/sky", "characters/walking");
  }

  if (segment.type === "payoff") {
    ordered.unshift(
      "emotions/confidence",
      "symbolic/sunrise",
      "emotions/peace",
    );
  }

  ordered.push(...DEFAULT_CATEGORY_FALLBACKS);

  return Array.from(
    new Set(ordered.map((item) => normalizeWhitespace(item)).filter(Boolean)),
  );
}

function scoreAssetForSegment(
  asset: QuoteReelVideoAsset,
  segment: QuoteReelSegment,
  context: {
    previousAssetPath?: string | null;
    previousCategoryPath?: string | null;
    usedAssetCounts: Map<string, number>;
    usedCategoryCounts: Map<string, number>;
  },
): number {
  let score = 0;
  const desiredCategories = getCandidateCategoriesForSegment(segment);

  const categoryIndex = desiredCategories.findIndex((category) =>
    category === asset.categoryPath
  );
  if (categoryIndex >= 0) {
    score += Math.max(120 - categoryIndex * 7, 25);
  }

  for (const tag of segment.visualTags ?? []) {
    if (
      asset.categoryPath.includes(tag) ||
      asset.filename.toLowerCase().includes(tag)
    ) {
      score += 18;
    }
  }

  if (segment.type === "hook" && asset.categoryPath.startsWith("hooks/")) {
    score += 30;
  }

  if (segment.type === "cta" && asset.categoryPath.startsWith("symbolic/")) {
    score += 16;
  }

  if (segment.type === "payoff" && asset.categoryPath.includes("confidence")) {
    score += 14;
  }

  if (
    context.previousAssetPath && context.previousAssetPath === asset.assetPath
  ) {
    score -= 1000;
  }

  if (
    context.previousCategoryPath &&
    context.previousCategoryPath === asset.categoryPath
  ) {
    score -= 80;
  }

  const usedAssetCount = context.usedAssetCounts.get(asset.assetPath) ?? 0;
  const usedCategoryCount =
    context.usedCategoryCounts.get(asset.categoryPath) ?? 0;

  score -= usedAssetCount * 120;
  score -= usedCategoryCount * 20;

  if (asset.categoryPath.startsWith("hooks/") && segment.type !== "hook") {
    score -= 10;
  }

  if (
    asset.categoryPath.startsWith("symbolic/") &&
    segment.type === "build" &&
    (segment.visualTags ?? []).some((tag) =>
      ["thinking", "reflection", "pain", "loneliness", "peace"].includes(tag)
    )
  ) {
    score += 8;
  }

  return score;
}

function chooseBestAsset(
  assets: QuoteReelVideoAsset[],
  segment: QuoteReelSegment,
  context: {
    previousAssetPath?: string | null;
    previousCategoryPath?: string | null;
    usedAssetCounts: Map<string, number>;
    usedCategoryCounts: Map<string, number>;
  },
): QuoteReelVideoAsset {
  if (!assets.length) {
    throw new Error("No quote reel video assets available");
  }

  const scored = shuffle(assets)
    .map((asset) => ({
      asset,
      score: scoreAssetForSegment(asset, segment, context),
    }))
    .sort((a, b) => b.score - a.score);

  return scored[0].asset;
}

export async function pickAssetsForQuoteReelSegments(
  input: PickAssetsInput,
): Promise<QuoteReelAssetPick[]> {
  const { segments } = input;

  if (!segments.length) return [];

  const assets = await listQuoteReelVideoAssets();
  if (!assets.length) {
    throw new Error("No video assets found in public/assets/videos");
  }

  const picks: QuoteReelAssetPick[] = [];

  const usedAssetCounts = new Map<string, number>();
  const usedCategoryCounts = new Map<string, number>();

  let previousAssetPath: string | null = null;
  let previousCategoryPath: string | null = null;

  for (const segment of segments) {
    const selected = chooseBestAsset(assets, segment, {
      previousAssetPath,
      previousCategoryPath,
      usedAssetCounts,
      usedCategoryCounts,
    });

    usedAssetCounts.set(
      selected.assetPath,
      (usedAssetCounts.get(selected.assetPath) ?? 0) + 1,
    );
    usedCategoryCounts.set(
      selected.categoryPath,
      (usedCategoryCounts.get(selected.categoryPath) ?? 0) + 1,
    );

    previousAssetPath = selected.assetPath;
    previousCategoryPath = selected.categoryPath;

    picks.push({
      segmentId: segment.id,
      assetType: "video",
      assetPath: selected.assetPath,
      sourceCategory: selected.categoryPath,
    });
  }

  return picks;
}
