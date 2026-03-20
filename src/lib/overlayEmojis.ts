export type OverlayEmojiId =
  | "hard-laugh"
  | "laugh"
  | "skull"
  | "mind_blown"
  | "fire"
  | "rocket"
  | "eyes"
  | "cry";

export const OVERLAY_EMOJIS: {
  id: OverlayEmojiId;
  label: string;
  char: string;
  assetFile: string;
}[] = [
  {
    id: "hard-laugh",
    label: "Hard Laugh",
    char: "🤣",
    assetFile: "hard-laugh.png",
  },
  { id: "laugh", label: "Laugh", char: "😂", assetFile: "laugh.png" },
  { id: "skull", label: "Skull", char: "💀", assetFile: "skull.png" },
  {
    id: "mind_blown",
    label: "Mind Blown",
    char: "🤯",
    assetFile: "mind-blown.png",
  },
  { id: "fire", label: "Fire", char: "🔥", assetFile: "fire.png" },
  { id: "rocket", label: "Rocket", char: "🚀", assetFile: "rocket.png" },
  { id: "eyes", label: "Eyes", char: "👀", assetFile: "eyes.png" },
  { id: "cry", label: "Cry", char: "😭", assetFile: "cry.png" },
];
