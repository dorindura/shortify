import type { CustomRange } from "./home.types";

export function parseTimeToSeconds(input: string): number | null {
  const value = input.trim();

  if (!value) return null;

  if (value.includes(":")) {
    const parts = value.split(":").map((part) => part.trim());

    if (parts.length !== 2) return null;

    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);

    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    if (minutes < 0 || seconds < 0 || seconds >= 60) return null;

    return minutes * 60 + seconds;
  }

  const totalSeconds = Number(value);
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return null;

  return totalSeconds;
}

export function buildCustomRangesPayload(customRanges: CustomRange[]) {
  return customRanges
    .map((range) => ({
      id: range.id,
      startSec: parseTimeToSeconds(range.startSec),
      endSec: parseTimeToSeconds(range.endSec),
    }))
    .filter(
      (
        range,
      ): range is {
        id: string;
        startSec: number;
        endSec: number;
      } =>
        typeof range.startSec === "number" &&
        typeof range.endSec === "number" &&
        Number.isFinite(range.startSec) &&
        Number.isFinite(range.endSec) &&
        range.endSec > range.startSec &&
        range.endSec - range.startSec >= 0.6,
    );
}
