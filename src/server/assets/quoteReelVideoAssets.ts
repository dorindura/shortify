// src/server/assets/quoteReelVideoAssets.ts
import fs from "fs/promises";
import path from "path";
import type {
  QuoteReelAssetPick,
  QuoteReelSegment,
  QuoteReelTone,
  QuoteReelVisualSource,
} from "@lib/jobsStore";

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
  tone?: QuoteReelTone;
  visualSource?: QuoteReelVisualSource;
};

const CATEGORY_TOKEN_ALIASES: Record<string, string[]> = {
  anger: ["angry"],
  awkward: ["awkward_moments"],
  broken_glass: ["broken_glass"],
  included: ["being_included"],
  judged: ["being_judged"],
  proud: ["proudness"],
  shock: ["shocking"],
  silhouette: ["silhouettes"],
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeCategoryToken(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getCategoryTokens(categoryPath: string): string[] {
  return categoryPath
    .split("/")
    .flatMap((part) => normalizeCategoryToken(part).split("_"))
    .filter(Boolean);
}

function categoryMatchesTag(categoryPath: string, tag: string): boolean {
  const normalizedTag = normalizeCategoryToken(tag);
  if (!normalizedTag) return false;

  const aliases = CATEGORY_TOKEN_ALIASES[normalizedTag] ?? [];
  const candidates = new Set([normalizedTag, ...aliases]);
  const normalizedCategory = normalizeCategoryToken(categoryPath);
  const categoryTokens = getCategoryTokens(categoryPath);

  for (const candidate of candidates) {
    if (normalizedCategory.includes(candidate)) return true;
    if (categoryTokens.includes(candidate)) return true;
  }

  return false;
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

function getTopLevelFamily(categoryPath: string): string {
  return normalizeWhitespace(categoryPath).split("/")[0] || "";
}

// People / interaction families we want to dominate the reel.
const PEOPLE_FAMILIES = new Set(["characters", "social_situations", "actions"]);
// Faces & energy: real people too, kept present for variety but not the majority.
const MILD_PEOPLE_FAMILIES = new Set(["emotions", "energy"]);
// Ambient / mood families (rain, roads, windows, sunsets, rooms...) that
// otherwise flood the output. Allowed only as a capped accent.
const AMBIENT_FAMILIES = new Set(["symbolic", "scenes_by_context"]);

function isPeopleFamily(family: string): boolean {
  return PEOPLE_FAMILIES.has(family);
}

function isMildPeopleFamily(family: string): boolean {
  return MILD_PEOPLE_FAMILIES.has(family);
}

function isAmbientFamily(family: string): boolean {
  return AMBIENT_FAMILIES.has(family);
}

function preferredFamiliesForTone(tone?: QuoteReelTone): string[] {
  if (tone === "aggressive") {
    return ["characters", "social_situations", "actions", "energy", "symbolic"];
  }

  if (tone === "calm" || tone === "emotional") {
    return ["emotions", "characters", "social_situations", "symbolic", "actions"];
  }

  return ["characters", "social_situations", "emotions", "symbolic", "actions"];
}

export async function listQuoteReelVideoAssets(
  visualSource: QuoteReelVisualSource = "auto",
): Promise<QuoteReelVideoAsset[]> {
  const files = await walkVideoFiles(VIDEO_ROOT);

  return files
    .map((assetPath) => ({
      assetPath,
      relativePath: path.relative(VIDEO_ROOT, assetPath).split(path.sep).join("/"),
      categoryPath: toCategoryPath(assetPath),
      filename: path.basename(assetPath),
    }))
    .filter((asset) => {
      const isCartoon =
        asset.categoryPath === "cartoons" || asset.categoryPath.startsWith("cartoons/");
      // Openers are reserved for the first clip of a reel — never part of the
      // normal per-segment pool.
      const isOpener =
        asset.categoryPath === "openers" || asset.categoryPath.startsWith("openers/");

      if (visualSource === "cartoons") return isCartoon;
      return !isCartoon && !isOpener;
    });
}

const OPENER_ROOT = path.join(VIDEO_ROOT, "openers");

// Map a hook segment's visual tags to keywords likely to appear in an opener
// filename, so the intro clip fits what the reel opens with.
const OPENER_TAG_KEYWORDS: Record<string, string[]> = {
  loneliness: ["lonewolf", "isolation", "sad", "empty", "night_drive"],
  alone: ["lonewolf", "isolation", "sad", "empty"],
  sadness: ["sad", "crying", "empty", "heartbreak"],
  pain: ["sad", "crying", "rain", "heartbreak"],
  rain: ["rain", "sad"],
  reflection: ["sad", "aesthetic", "night_drive"],
  thinking: ["sad", "aesthetic", "isolation"],
  anxiety: ["sad", "crying", "isolation"],
  overthinking: ["sad", "isolation", "aesthetic"],
  betrayal: ["itachi", "sasuke", "conflict", "reiji"],
  toxic: ["reiji", "conflict", "sasuke"],
  anger: ["ds", "jjk", "aot", "conflict", "zenitsu"],
  chaos: ["ds", "jjk", "aot", "zenitsu", "thunder"],
  intense: ["ds", "jjk", "aot", "berserk", "zenitsu"],
  fight: ["ds", "jjk", "aot", "berserk", "zenitsu"],
  conflict: ["conflict", "toradora", "aot"],
  reacting: ["ds", "jjk", "aot", "conflict"],
  confidence: ["berserk", "thorfinn", "levi", "win", "hype"],
  determination: ["thorfinn", "levi", "eren", "effort", "haikyuu", "win"],
  strength: ["berserk", "thorfinn", "aot", "levi"],
  resilience: ["effort", "haikyuu", "thorfinn", "win"],
  hope: ["yourname", "comet", "sky", "couple"],
  sunrise: ["yourname", "sky", "comet"],
  sky: ["yourname", "comet", "sky"],
  peace: ["yourname", "aesthetic", "sky"],
  healing: ["yourname", "silentvoice", "aesthetic"],
  love: ["couple", "romance", "silentvoice", "yourname"],
  friendship: ["haikyuu", "effort", "sports", "couple"],
  duo: ["couple", "silentvoice", "romance"],
  empathy: ["silentvoice", "couple", "romance"],
  nostalgia: ["yourname", "aesthetic", "silentvoice"],
  transformation: ["yourname", "win", "hype", "effort"],
};

// Tone-level fallback keywords when the tags don't strongly match anything.
function openerKeywordsForTone(tone?: QuoteReelTone): string[] {
  if (tone === "aggressive") return ["ds", "jjk", "aot", "berserk", "thorfinn", "win", "hype"];
  if (tone === "dark" || tone === "stoic")
    return ["berserk", "thorfinn", "itachi", "reiji", "isolation", "sad"];
  if (tone === "calm" || tone === "emotional")
    return ["yourname", "silentvoice", "sad", "aesthetic", "couple"];
  return ["yourname", "aesthetic", "berserk", "sad"]; // cinematic default
}

export async function listOpenerAssets(): Promise<QuoteReelVideoAsset[]> {
  const files = await walkVideoFiles(OPENER_ROOT);

  return files.map((assetPath) => ({
    assetPath,
    relativePath: path.relative(VIDEO_ROOT, assetPath).split(path.sep).join("/"),
    categoryPath: toCategoryPath(assetPath),
    filename: path.basename(assetPath),
  }));
}

// Pick the opener that best fits the hook segment's visual tags (with a tone
// fallback), lightly shuffled so it isn't always the same clip.
function pickOpenerForHook(
  openers: QuoteReelVideoAsset[],
  segment: QuoteReelSegment,
  tone: QuoteReelTone | undefined,
  usedAssetCounts: Map<string, number>,
): QuoteReelVideoAsset {
  const desired = new Set<string>();
  for (const tag of segment.visualTags ?? []) {
    const normalizedTag = normalizeCategoryToken(tag);
    (OPENER_TAG_KEYWORDS[normalizedTag] ?? []).forEach((kw) => desired.add(kw));
    // also allow the raw tag itself to match a filename token
    desired.add(normalizedTag);
  }
  openerKeywordsForTone(tone).forEach((kw) => desired.add(kw));

  const scored = shuffle(openers)
    .map((asset) => {
      const name = asset.filename.toLowerCase();
      let score = 0;
      for (const kw of desired) {
        if (kw && name.includes(kw)) score += 12;
      }
      // avoid repeating an opener used earlier in the (batch) session run
      score -= (usedAssetCounts.get(asset.assetPath) ?? 0) * 40;
      return { asset, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0].asset;
}

const VISUAL_TAG_CATEGORY_MAP: Record<string, string[]> = {
  alone: ["characters/alone", "social_situations/loneliness_in_crowd", "symbolic/window"],
  anger: ["emotions/angry", "energy/intense", "characters/fight", "actions/reacting"],
  anxiety: ["emotions/anxiety", "characters/staring", "scenes_by_context/room", "symbolic/rain"],
  arriving: ["actions/arriving", "scenes_by_context/street", "scenes_by_context/public_transport"],
  attention: ["characters/staring", "actions/observing", "hooks/attention"],
  awkward: ["social_situations/awkward_moments", "social_situations/being_judged"],
  bond: ["energy/bond", "social_situations/friendship", "characters/duo"],
  calm: ["energy/calm", "emotions/peace", "symbolic/sky", "symbolic/ocean"],
  chaos: ["energy/chaos", "emotions/angry", "actions/reacting", "hooks/shocking"],
  city_night: ["symbolic/city_night", "symbolic/shadows", "scenes_by_context/street"],
  conflict: [
    "characters/fight",
    "characters/duo",
    "characters/staring",
    "social_situations/group_dynamics",
    "social_situations/being_judged",
  ],
  confidence: ["emotions/confidence", "characters/walking", "characters/faceless"],
  curiosity: ["actions/observing", "characters/thinking", "characters/staring", "hooks/curiosity"],
  dark: ["symbolic/shadows", "symbolic/city_night", "symbolic/rain"],
  duo: ["characters/duo", "social_situations/friendship", "social_situations/being_included"],
  emotional: ["hooks/emotional", "emotions/sadness", "symbolic/rain"],
  empathy: ["emotions/empathy", "actions/helping", "social_situations/friendship"],
  faceless: ["characters/faceless", "symbolic/silhouettes", "symbolic/shadows"],
  fire: ["symbolic/fire", "energy/intense", "hooks/shocking"],
  forgiveness: ["emotions/peace", "emotions/empathy", "actions/listening", "symbolic/sunrise"],
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
  healing: ["emotions/peace", "symbolic/sunrise", "symbolic/sky", "symbolic/ocean"],
  hope: ["symbolic/sunrise", "symbolic/sky", "emotions/confidence"],
  ignoring: ["actions/ignoring", "social_situations/being_judged"],
  included: [
    "social_situations/being_included",
    "social_situations/friendship",
    "characters/group",
  ],
  intense: ["energy/intense", "characters/fight", "actions/reacting", "hooks/shocking"],
  judged: [
    "social_situations/being_judged",
    "social_situations/group_dynamics",
    "characters/group",
  ],
  kindness: ["emotions/kindness", "actions/helping", "emotions/empathy"],
  leaving: ["actions/leaving", "characters/walking", "scenes_by_context/street"],
  listening: ["actions/listening", "characters/duo", "actions/helping"],
  loneliness: ["emotions/loneliness", "characters/alone"],
  loneliness_in_crowd: [
    "social_situations/loneliness_in_crowd",
    "characters/group",
    "social_situations/group_dynamics",
    "social_situations/being_judged",
    "characters/alone",
  ],
  love: ["emotions/love", "social_situations/friendship", "characters/duo"],
  manipulation: ["characters/fake", "emotions/toxic", "symbolic/shadows", "characters/staring"],
  masks: ["symbolic/masks", "characters/fake", "characters/faceless", "symbolic/shadows"],
  movement: ["characters/walking", "characters/stepping", "actions/arriving"],
  nostalgia: ["emotions/nostalgia", "symbolic/sunset", "symbolic/window"],
  observing: ["actions/observing", "characters/staring", "characters/thinking"],
  ocean: ["symbolic/ocean", "emotions/peace"],
  pain: ["emotions/sadness", "emotions/anxiety", "symbolic/rain", "symbolic/window"],
  peace: ["emotions/peace", "symbolic/sky", "symbolic/ocean", "symbolic/sunrise"],
  protecting: ["actions/protecting", "actions/helping", "characters/duo"],
  rain: ["symbolic/rain", "emotions/sadness", "symbolic/window"],
  overthinking: ["characters/thinking", "emotions/anxiety", "scenes_by_context/bedroom", "symbolic/window"],
  reacting: ["actions/reacting", "characters/staring", "hooks/shocking"],
  red_flag: [
    "hooks/red_flag",
    "emotions/toxic",
    "characters/fake",
    "characters/staring",
    "symbolic/masks",
  ],
  reflection: [
    "characters/thinking",
    "symbolic/window",
    "scenes_by_context/room",
    "characters/staring",
  ],
  rejection: [
    "actions/ignoring",
    "actions/leaving",
    "social_situations/being_judged",
    "social_situations/group_dynamics",
    "characters/alone",
  ],
  regret: ["emotions/sadness", "characters/thinking", "symbolic/rain"],
  resilience: ["emotions/confidence", "characters/walking", "symbolic/sunrise"],
  room: ["scenes_by_context/room", "characters/sitting", "characters/thinking"],
  sadness: ["emotions/sadness", "symbolic/rain", "characters/alone"],
  self_respect: [
    "emotions/confidence",
    "characters/faceless",
    "characters/walking",
    "symbolic/shadows",
  ],
  shadows: ["symbolic/shadows", "symbolic/city_night", "symbolic/silhouettes"],
  shame: ["characters/looking_down", "emotions/disappointment", "social_situations/being_judged"],
  shock: ["hooks/shocking", "actions/reacting", "energy/chaos"],
  silhouette: ["symbolic/silhouettes", "characters/faceless", "symbolic/shadows"],
  sky: ["symbolic/sky", "symbolic/sunrise", "symbolic/sunset"],
  slow_motion: ["symbolic/silhouettes", "characters/walking"],
  stars: ["symbolic/stars", "symbolic/sky", "symbolic/city_night"],
  stoic: ["characters/faceless", "characters/thinking", "symbolic/shadows", "symbolic/window"],
  street: ["scenes_by_context/street", "characters/walking", "actions/arriving"],
  strength: ["emotions/confidence", "energy/intense", "characters/walking"],
  sunrise: ["symbolic/sunrise", "symbolic/sky", "emotions/peace"],
  sunset: ["symbolic/sunset", "emotions/nostalgia", "symbolic/sky"],
  thinking: [
    "characters/thinking",
    "characters/staring",
    "symbolic/window",
    "scenes_by_context/room",
  ],
  text_message: ["symbolic/phone", "actions/scrolling_phone", "emotions/anxiety"],
  text_messages: ["symbolic/text_messages", "symbolic/phone", "actions/scrolling_phone", "emotions/anxiety"],
  transformation: [
    "hooks/transformation",
    "emotions/confidence",
    "emotions/determination",
    "characters/walking",
    "symbolic/sunrise",
  ],
  walking: ["characters/walking", "characters/stepping", "scenes_by_context/street"],
  window: ["symbolic/window", "scenes_by_context/room", "characters/thinking"],
};

const FIRST_SEGMENT_IMPACT_CATEGORIES = [
  "characters/staring",
  "characters/faceless",
  "characters/alone",
  "characters/group",
  "characters/duo",
  "characters/looking_down",
  "actions/scrolling_phone",
  "actions/opening_door",
  "actions/ignoring",
  "actions/leaving",
  "actions/reacting",
  "hooks/red_flag",
  "hooks/transformation",
  "social_situations/being_judged",
  "social_situations/group_dynamics",
  "social_situations/awkward_moments",
  "social_situations/loneliness_in_crowd",
  "social_situations/rejection",
  "emotions/betrayal",
  "emotions/toxic",
  "emotions/anxiety",
  "emotions/loneliness",
  "symbolic/phone",
  "symbolic/text_messages",
  "symbolic/masks",
  "symbolic/doors",
  "symbolic/window",
  "symbolic/shadows",
  "symbolic/silhouettes",
];

const DEFAULT_CATEGORY_FALLBACKS = [
  "characters/thinking",
  "characters/walking",
  "characters/duo",
  "social_situations/friendship",
  "characters/group",
  "actions/observing",
];

function getCandidateCategoriesForTag(tag: string, allCategoryPaths: string[]): string[] {
  const curated = VISUAL_TAG_CATEGORY_MAP[tag] ?? [];
  const discovered = allCategoryPaths.filter((categoryPath) =>
    categoryMatchesTag(categoryPath, tag),
  );

  return [...curated, ...discovered];
}

function getCandidateCategoriesForSegment(
  segment: QuoteReelSegment,
  allCategoryPaths: string[],
): string[] {
  const ordered: string[] = [];

  for (const tag of segment.visualTags ?? []) {
    ordered.push(...getCandidateCategoriesForTag(tag, allCategoryPaths));
  }

  if (segment.type === "hook") {
    ordered.unshift(...FIRST_SEGMENT_IMPACT_CATEGORIES);
  }

  if (segment.type === "cta") {
    ordered.unshift("symbolic/sunrise", "symbolic/sky", "characters/walking");
  }

  if (segment.type === "payoff") {
    ordered.unshift("emotions/confidence", "symbolic/sunrise", "emotions/peace");
  }

  ordered.push(...DEFAULT_CATEGORY_FALLBACKS);

  return Array.from(new Set(ordered.map((item) => normalizeWhitespace(item)).filter(Boolean)));
}

function scoreAssetForSegment(
  asset: QuoteReelVideoAsset,
  segment: QuoteReelSegment,
  context: {
    previousAssetPath?: string | null;
    previousCategoryPath?: string | null;
    usedAssetCounts: Map<string, number>;
    usedCategoryCounts: Map<string, number>;
    allCategoryPaths: string[];
    tone?: QuoteReelTone;
    segmentIndex: number;
  },
): number {
  let score = 0;
  const desiredCategories = getCandidateCategoriesForSegment(segment, context.allCategoryPaths);
  const family = getTopLevelFamily(asset.categoryPath);
  const previousFamily = context.previousCategoryPath
    ? getTopLevelFamily(context.previousCategoryPath)
    : "";
  const preferredFamilyIndex = preferredFamiliesForTone(context.tone).indexOf(family);

  const categoryIndex = desiredCategories.findIndex((category) => category === asset.categoryPath);
  if (categoryIndex >= 0) {
    score += Math.max(120 - categoryIndex * 7, 25);
  }

  if (preferredFamilyIndex >= 0) {
    score += Math.max(34 - preferredFamilyIndex * 7, 8);
  }

  if (previousFamily && previousFamily === family) {
    score += 22;
  } else if (previousFamily && context.segmentIndex % 3 !== 0) {
    score -= 28;
  }

  // People-first: strongly favor scenes with real people and interaction, and
  // discourage ambient/mood scenes that otherwise dominate the library. Ambient
  // stays available as a capped accent (see pickAssetsForQuoteReelSegments).
  if (isPeopleFamily(family)) {
    score += 46;
    if (family === "social_situations") score += 12; // interaction is rare + valuable
  } else if (isMildPeopleFamily(family)) {
    score += 28; // faces / energy add variety, just not the majority
  } else if (isAmbientFamily(family)) {
    score -= 28;
    // ...but a symbolic scene can be a tasteful accent on the closing beats.
    if (
      asset.categoryPath.startsWith("symbolic/") &&
      (segment.type === "payoff" || segment.type === "cta")
    ) {
      score += 26;
    }
  }

  for (const tag of segment.visualTags ?? []) {
    if (asset.categoryPath.includes(tag) || asset.filename.toLowerCase().includes(tag)) {
      score += 18;
    }
  }

  if (segment.type === "hook") {
    if (FIRST_SEGMENT_IMPACT_CATEGORIES.includes(asset.categoryPath)) score += 42;
    if (asset.categoryPath.startsWith("hooks/")) score -= 18;
  }

  if (segment.type === "cta" && asset.categoryPath.startsWith("symbolic/")) {
    score += 16;
  }

  if (segment.type === "payoff" && asset.categoryPath.includes("confidence")) {
    score += 14;
  }

  if (context.previousAssetPath && context.previousAssetPath === asset.assetPath) {
    score -= 1000;
  }

  if (context.previousCategoryPath && context.previousCategoryPath === asset.categoryPath) {
    score -= 22;
  }

  const usedAssetCount = context.usedAssetCounts.get(asset.assetPath) ?? 0;
  const usedCategoryCount = context.usedCategoryCounts.get(asset.categoryPath) ?? 0;

  score -= usedAssetCount * 120;
  score -= usedCategoryCount * 20;

  if (asset.categoryPath.startsWith("hooks/") && segment.type !== "hook") {
    score -= 10;
  }

  if (
    asset.categoryPath.startsWith("symbolic/") &&
    segment.type === "build" &&
    (segment.visualTags ?? []).some((tag) =>
      ["thinking", "reflection", "pain", "loneliness", "peace"].includes(tag),
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
    tone?: QuoteReelTone;
    segmentIndex: number;
    ambientAllowed: boolean;
  },
): QuoteReelVideoAsset {
  if (!assets.length) {
    throw new Error("No quote reel video assets available");
  }

  // Once the per-reel ambient budget is spent, drop ambient assets entirely so
  // the remaining segments are guaranteed to be people/interaction scenes.
  const pool =
    context.ambientAllowed === false
      ? assets.filter((asset) => !isAmbientFamily(getTopLevelFamily(asset.categoryPath)))
      : assets;
  const effectiveAssets = pool.length ? pool : assets;

  const allCategoryPaths = Array.from(
    new Set(effectiveAssets.map((item) => item.categoryPath).filter(Boolean)),
  );

  const scored = shuffle(effectiveAssets)
    .map((asset) => ({
      asset,
      score: scoreAssetForSegment(asset, segment, {
        ...context,
        allCategoryPaths,
      }),
    }))
    .sort((a, b) => b.score - a.score);

  return scored[0].asset;
}

export async function pickAssetsForQuoteReelSegments(
  input: PickAssetsInput,
): Promise<QuoteReelAssetPick[]> {
  const { segments, tone, visualSource = "auto" } = input;

  if (!segments.length) return [];

  const assets = await listQuoteReelVideoAssets(visualSource);
  if (!assets.length) {
    throw new Error(
      visualSource === "cartoons"
        ? "No cartoon video assets found in public/assets/videos/cartoons"
        : "No video assets found in public/assets/videos",
    );
  }

  const picks: QuoteReelAssetPick[] = [];

  const usedAssetCounts = new Map<string, number>();
  const usedCategoryCounts = new Map<string, number>();

  // Smart-cinematic reels open with a dedicated "opener" clip, matched to the
  // hook's visual tags (see public/assets/videos/openers).
  const openers = visualSource === "auto" ? await listOpenerAssets() : [];

  let previousAssetPath: string | null = null;
  let previousCategoryPath: string | null = null;

  // People-first budget: cap ambient/mood scenes at ~20% of the reel so it's
  // seasoning, not the meal. Always allow at least one for a tasteful accent.
  const maxAmbient = Math.max(1, Math.round(segments.length * 0.2));
  let ambientUsed = 0;

  for (const [segmentIndex, segment] of segments.entries()) {
    let selected: QuoteReelVideoAsset;

    if (visualSource === "auto" && segmentIndex === 0 && openers.length) {
      // The very first clip of a cinematic reel is a matched anime opener.
      selected = pickOpenerForHook(openers, segment, tone, usedAssetCounts);
    } else if (visualSource === "cartoons") {
      selected = shuffle(assets).sort(
        (a, b) =>
          (usedAssetCounts.get(a.assetPath) ?? 0) - (usedAssetCounts.get(b.assetPath) ?? 0),
      )[0];
    } else {
      selected = chooseBestAsset(assets, segment, {
        previousAssetPath,
        previousCategoryPath,
        usedAssetCounts,
        usedCategoryCounts,
        tone,
        segmentIndex,
        ambientAllowed: ambientUsed < maxAmbient,
      });
    }

    if (isAmbientFamily(getTopLevelFamily(selected.categoryPath))) {
      ambientUsed += 1;
    }

    usedAssetCounts.set(selected.assetPath, (usedAssetCounts.get(selected.assetPath) ?? 0) + 1);
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
