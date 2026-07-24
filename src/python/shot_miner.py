#!/usr/bin/env python3
"""
Shot miner: split a video into individual camera shots and keep only the ones
usable as reel b-roll. Emits JSON describing each surviving shot plus a
representative frame (for a downstream AI-vision quality/category pass).

Mechanical only (fast, free): shot detection, length/black/freeze/motion
filters, and face/person presence. Watermark / subtitle / quality / category
judgment is deliberately left to the vision model in the orchestrator.

Usage:
  python shot_miner.py --input video.mp4 --frames-dir /tmp/frames \
      [--min-len 1.6] [--max-len 6.0] [--sample-fps 6]
Prints a JSON object to stdout.
"""
import argparse
import json
import os
import sys

import cv2
import numpy as np

try:
    import mediapipe as mp

    _FACE = mp.solutions.face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5)
except Exception:
    _FACE = None


def detect_content_crop(cap, samples=20):
    """Find the non-letterbox content rectangle (x, y, w, h)."""
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if total <= 0:
        return (0, 0, W, H)

    acc = np.zeros((H, W), dtype=np.float32)
    n = 0
    for i in np.linspace(0, total - 1, samples).astype(int):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(i))
        ok, frame = cap.read()
        if not ok:
            continue
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32)
        acc = np.maximum(acc, gray)
        n += 1
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    if n == 0:
        return (0, 0, W, H)

    thresh = 18
    col_active = np.where(acc.max(axis=0) > thresh)[0]
    row_active = np.where(acc.max(axis=1) > thresh)[0]
    if col_active.size == 0 or row_active.size == 0:
        return (0, 0, W, H)
    x0, x1 = int(col_active[0]), int(col_active[-1])
    y0, y1 = int(row_active[0]), int(row_active[-1])
    return (x0, y0, max(1, x1 - x0 + 1), max(1, y1 - y0 + 1))


def hsv_hist(frame):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    h = cv2.calcHist([hsv], [0, 1], None, [32, 32], [0, 180, 0, 256])
    cv2.normalize(h, h)
    return h


def phash(gray):
    """64-bit DCT perceptual hash (hex) of a grayscale frame."""
    img = cv2.resize(gray.astype(np.float32), (32, 32))
    dct = cv2.dct(img)
    low = dct[:8, :8].flatten()
    med = np.median(low[1:])  # ignore the DC term
    bits = low > med
    val = 0
    for b in bits:
        val = (val << 1) | int(b)
    return format(val, "016x")


def shot_phashes(seg, k=6):
    """Perceptual fingerprints sampled across a shot's frames (for dedup)."""
    if not seg:
        return []
    idxs = sorted(set(np.linspace(0, len(seg) - 1, min(k, len(seg))).astype(int)))
    return [phash(seg[i]) for i in idxs]


def face_count(frame):
    if _FACE is None:
        return -1  # unavailable
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    res = _FACE.process(rgb)
    return len(res.detections) if res.detections else 0


def analyze(video_path, frames_dir, min_len, max_len, sample_fps, cut_corr):
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if total <= 0 or fps <= 0:
        return {"error": "unreadable video", "shots": []}

    cx, cy, cw, ch = detect_content_crop(cap)
    duration = total / fps
    step = max(1, int(round(fps / sample_fps)))

    times, hists, smalls = [], [], []
    idx = 0
    while True:
        if not cap.grab():
            break
        if idx % step == 0:
            ok, frame = cap.retrieve()
            if ok:
                content = frame[cy:cy + ch, cx:cx + cw]
                smalls.append(cv2.resize(cv2.cvtColor(content, cv2.COLOR_BGR2GRAY), (64, 36)).astype(np.float32))
                hists.append(hsv_hist(content))
                times.append(idx / fps)
        idx += 1
    cap.release()

    if len(hists) < 3:
        return {"error": "too few frames", "shots": []}

    # 1) Shot boundaries where consecutive-frame color histograms diverge.
    boundaries = [0]
    for i in range(1, len(hists)):
        corr = cv2.compareHist(hists[i - 1], hists[i], cv2.HISTCMP_CORREL)
        if corr < cut_corr:
            boundaries.append(i)
    boundaries.append(len(hists))

    # Reopen for full-res representative frames.
    cap = cv2.VideoCapture(video_path)
    os.makedirs(frames_dir, exist_ok=True)
    shots = []
    for si in range(len(boundaries) - 1):
        a, b = boundaries[si], boundaries[si + 1]
        if b - a < 2:
            continue
        start_t, end_t = times[a], times[min(b, len(times) - 1)]
        dur = end_t - start_t
        if dur < min_len or dur > max_len:
            continue

        seg = smalls[a:b]
        # motion: mean abs diff between consecutive sampled frames
        diffs = [float(np.mean(np.abs(seg[j] - seg[j - 1]))) for j in range(1, len(seg))]
        motion = float(np.mean(diffs)) if diffs else 0.0
        brightness = float(np.mean(seg[len(seg) // 2]))
        # reject near-black or frozen
        if brightness < 12:
            continue
        if motion < 0.6:  # basically a still frame
            continue

        mid_t = (start_t + end_t) / 2.0
        cap.set(cv2.CAP_PROP_POS_MSEC, mid_t * 1000.0)
        ok, frame = cap.read()
        if not ok:
            continue
        content = frame[cy:cy + ch, cx:cx + cw]
        faces = face_count(content)

        fname = f"shot_{si:04d}_{start_t:.2f}-{end_t:.2f}.jpg"
        fpath = os.path.join(frames_dir, fname)
        cv2.imwrite(fpath, content, [cv2.IMWRITE_JPEG_QUALITY, 90])

        shots.append({
            "start": round(start_t, 3),
            "end": round(end_t, 3),
            "dur": round(dur, 3),
            "motion": round(motion, 3),
            "brightness": round(brightness, 1),
            "faces": faces,
            "frame": fpath,
            "phashes": shot_phashes(seg),
        })

    cap.release()
    return {
        "duration": round(duration, 2),
        "fps": round(fps, 2),
        "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) if False else cw + cx,
        "content_crop": [cx, cy, cw, ch],
        "shot_count": len(shots),
        "shots": shots,
    }


def phash_clip(video_path, k=6):
    """Fingerprint an already-cut clip (for backfilling the dedup index)."""
    cap = cv2.VideoCapture(video_path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    hashes = []
    if total > 0:
        for i in np.linspace(0, total - 1, min(k, total)).astype(int):
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(i))
            ok, frame = cap.read()
            if ok:
                hashes.append(phash(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)))
    cap.release()
    return hashes


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--frames-dir", required=False, default="")
    p.add_argument("--phash-only", action="store_true", help="just fingerprint a cut clip")
    p.add_argument("--min-len", type=float, default=1.6)
    p.add_argument("--max-len", type=float, default=6.0)
    p.add_argument("--sample-fps", type=float, default=6.0)
    p.add_argument("--cut-corr", type=float, default=0.5)
    args = p.parse_args()

    if not os.path.exists(args.input):
        print(json.dumps({"error": "input not found", "shots": []}))
        sys.exit(1)

    if args.phash_only:
        print(json.dumps({"phashes": phash_clip(args.input)}))
        return

    result = analyze(args.input, args.frames_dir, args.min_len, args.max_len, args.sample_fps, args.cut_corr)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
