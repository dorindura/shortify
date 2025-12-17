import argparse
import json
import os
import sys
from typing import List, Dict, Any, Optional, Tuple

import math
import cv2
import mediapipe as mp


def clamp01(v: float) -> float:
    return max(0.0, min(1.0, float(v)))


def dist2(a, b):
    dx = float(a[0]) - float(b[0])
    dy = float(a[1]) - float(b[1])
    return dx * dx + dy * dy


def euclid(a, b):
    return math.sqrt(dist2(a, b))


def bbox_edges_from_cxcywh(cx, cy, w, h):
    x0 = clamp01(cx - w / 2.0)
    y0 = clamp01(cy - h / 2.0)
    x1 = clamp01(cx + w / 2.0)
    y1 = clamp01(cy + h / 2.0)
    return {"x0": x0, "y0": y0, "x1": x1, "y1": y1}


def iou(a, b):
    ax0, ay0, ax1, ay1 = a["x0"], a["y0"], a["x1"], a["y1"]
    bx0, by0, bx1, by1 = b["x0"], b["y0"], b["x1"], b["y1"]

    inter_x0 = max(ax0, bx0)
    inter_y0 = max(ay0, by0)
    inter_x1 = min(ax1, bx1)
    inter_y1 = min(ay1, by1)

    iw = max(0.0, inter_x1 - inter_x0)
    ih = max(0.0, inter_y1 - inter_y0)
    inter = iw * ih

    area_a = max(0.0, ax1 - ax0) * max(0.0, ay1 - ay0)
    area_b = max(0.0, bx1 - bx0) * max(0.0, by1 - by0)
    denom = max(1e-9, area_a + area_b - inter)
    return inter / denom


def mouth_openness_from_landmarks(lm):
    """
    Mouth openness = inner lip gap (13-14) / mouth width (61-291)
    Landmarks are in normalized ROI coordinates (0..1).
    """
    try:
        upper = (lm[13].x, lm[13].y)
        lower = (lm[14].x, lm[14].y)
        left = (lm[61].x, lm[61].y)
        right = (lm[291].x, lm[291].y)

        open_dist = euclid(upper, lower)
        width_dist = max(1e-6, euclid(left, right))
        return float(open_dist / width_dist)
    except Exception:
        return 0.0


def to_int(v: float) -> int:
    return int(round(v))


def norm_bbox_to_px(b, W: int, H: int) -> Tuple[int, int, int, int]:
    """
    b: dict {x0,y0,x1,y1} normalized
    returns x0,y0,x1,y1 in pixels, clamped
    """
    x0 = max(0, min(W - 1, to_int(b["x0"] * W)))
    y0 = max(0, min(H - 1, to_int(b["y0"] * H)))
    x1 = max(0, min(W - 1, to_int(b["x1"] * W)))
    y1 = max(0, min(H - 1, to_int(b["y1"] * H)))
    # ensure proper ordering
    if x1 <= x0:
        x1 = min(W - 1, x0 + 1)
    if y1 <= y0:
        y1 = min(H - 1, y0 + 1)
    return x0, y0, x1, y1


def expand_bbox_edges(b, margin: float = 0.18) -> Dict[str, float]:
    """
    Expand bbox by margin ratio around its size in normalized coords.
    """
    x0, y0, x1, y1 = b["x0"], b["y0"], b["x1"], b["y1"]
    w = x1 - x0
    h = y1 - y0
    x0 = clamp01(x0 - w * margin)
    x1 = clamp01(x1 + w * margin)
    y0 = clamp01(y0 - h * margin)
    y1 = clamp01(y1 + h * margin)
    return {"x0": x0, "y0": y0, "x1": x1, "y1": y1}


def analyze_clip(
        clip_path: str,
        sample_stride: int = 2,
        min_track_points: int = 5,
        # max_assign_dist: float = 0.18,   # center distance gate (normalized)
        # min_iou_gate: float = 0.04,      # bbox overlap gate (prevents swaps)
        # max_missed_sec: float = 1.0,     # KEEP track alive this long if temporarily missing
        max_assign_dist: float = 0.28,   # allow re-connecting after motion/jitter
        min_iou_gate: float = 0.01,      # don't kill matches because bbox moved a bit
        max_missed_sec: float = 2.5,
        debug_out: Optional[str] = None,
        debug_max_frames: int = 0,
) -> Dict[str, Any]:
    cap = cv2.VideoCapture(clip_path)
    if not cap.isOpened():
        return {
            "clipPath": os.path.abspath(clip_path),
            "error": f"Could not open video: {clip_path}",
            "faces": [],
        }

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = frame_count / fps if fps > 0 else 0.0

    # ✅ Multi-face detector (this is what you were missing)
    mp_fd = mp.solutions.face_detection.FaceDetection(
        model_selection=1,             # better for farther faces / wider shots
        min_detection_confidence=0.30  # lower to catch smaller faces
    )

    # ✅ FaceMesh only used per detected bbox ROI (max 1 face)
    mp_fm = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=True,        # we are feeding cropped "images"
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
    )

    # tracks: { id, last_center, last_bbox_edges, last_t, missed, timeline }
    tracks: List[Dict[str, Any]] = []
    finished_tracks: List[Dict[str, Any]] = []
    next_id = 0

    # debug writer
    writer = None
    if debug_out:
        W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        if W > 0 and H > 0:
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            writer = cv2.VideoWriter(debug_out, fourcc, fps, (W, H))

    frame_idx = 0
    written = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if sample_stride > 1 and (frame_idx % sample_stride != 0):
            frame_idx += 1
            continue

        t = frame_idx / fps
        H, W = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # 1) FaceDetection -> multiple bboxes
        det_results = mp_fd.process(rgb)
        detections: List[Dict[str, Any]] = []

        if det_results.detections:
            for det in det_results.detections:
                loc = det.location_data
                if not loc.HasField("relative_bounding_box"):
                    continue
                bb = loc.relative_bounding_box

                x = clamp01(bb.xmin)
                y = clamp01(bb.ymin)
                w = clamp01(bb.width)
                h = clamp01(bb.height)

                cx = clamp01(x + w / 2.0)
                cy = clamp01(y + h / 2.0)

                raw_w = clamp01(bb.width)
                raw_h = clamp01(bb.height)

                bbox = bbox_edges_from_cxcywh(cx, cy, raw_w, raw_h)
                bbox_expanded = expand_bbox_edges(bbox, margin=0.18)

                detections.append({
                    "cx": float(cx),
                    "cy": float(cy),
                    "w": float(raw_w),
                    "h": float(raw_h),
                    "bbox": bbox_expanded,
                    "mouth": 0.0,
                })

        # 2) For EACH detection: run FaceMesh on ROI -> mouth score
        for d in detections:
            x0, y0, x1, y1 = norm_bbox_to_px(d["bbox"], W, H)
            roi = rgb[y0:y1, x0:x1]
            if roi.size == 0:
                d["mouth"] = 0.0
                continue

            mesh_res = mp_fm.process(roi)
            if not mesh_res.multi_face_landmarks:
                d["mouth"] = 0.0
                continue

            lm = mesh_res.multi_face_landmarks[0].landmark
            d["mouth"] = float(mouth_openness_from_landmarks(lm))

        # 3) Assignment: detections -> tracks
        used = set()

        # prune / keep tracks (TTL)
        alive_tracks = []
        for tr in tracks:
            if (t - tr.get("last_t", -1e9)) <= max_missed_sec:
                alive_tracks.append(tr)
            else:
                finished_tracks.append(tr)
        tracks = alive_tracks

        # prefer recent tracks first
        tracks.sort(key=lambda tr: tr.get("last_t", -1), reverse=True)

        for tr in tracks:
            best_j = None
            best_score = 1e9

            for j, det in enumerate(detections):
                if j in used:
                    continue

                d = euclid((det["cx"], det["cy"]), tr["last_center"])
                if d > max_assign_dist:
                    continue

                ov = iou(det["bbox"], tr["last_bbox_edges"])
                if ov < min_iou_gate:
                    continue

                score = d - 0.15 * ov
                if score < best_score:
                    best_score = score
                    best_j = j

            if best_j is not None:
                det = detections[best_j]
                used.add(best_j)

                tr["timeline"].append({
                    "t": float(t),
                    "x": det["cx"],
                    "y": det["cy"],
                    "w": det["w"],
                    "h": det["h"],
                    "mouth": det["mouth"],
                })
                tr["last_center"] = (det["cx"], det["cy"])
                # tr["last_bbox_edges"] = det["bbox"]

                # Smooth bbox to reduce jitter (EMA)
                prev = tr["last_bbox_edges"]
                cur = det["bbox"]
                alpha = 0.7  # higher = smoother
                tr["last_bbox_edges"] = {
                    "x0": alpha * prev["x0"] + (1 - alpha) * cur["x0"],
                    "y0": alpha * prev["y0"] + (1 - alpha) * cur["y0"],
                    "x1": alpha * prev["x1"] + (1 - alpha) * cur["x1"],
                    "y1": alpha * prev["y1"] + (1 - alpha) * cur["y1"],
                }

                tr["last_t"] = t

                tr["missed_sec"] = 0.0

        # 4) Create new tracks for unused detections
        for j, det in enumerate(detections):
            if j in used:
                continue
            tracks.append({
                "id": next_id,
                "last_center": (det["cx"], det["cy"]),
                "last_bbox_edges": det["bbox"],
                "last_t": t,
                "missed_sec": 0.0,
                "timeline": [{
                    "t": float(t),
                    "x": det["cx"],
                    "y": det["cy"],
                    "w": det["w"],
                    "h": det["h"],
                    "mouth": det["mouth"],
                }],
            })
            next_id += 1

        # 5) Debug draw
        if writer is not None:
            dbg = frame.copy()

            # draw detections (green)
            for d in detections:
                x0, y0, x1, y1 = norm_bbox_to_px(d["bbox"], W, H)
                cv2.rectangle(dbg, (x0, y0), (x1, y1), (0, 255, 0), 2)
                cv2.circle(dbg, (to_int(d["cx"] * W), to_int(d["cy"] * H)), 4, (0, 255, 0), -1)
                cv2.putText(
                    dbg,
                    f"mouth={d['mouth']:.3f}",
                    (x0, max(0, y0 - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0, 255, 0),
                    1,
                    cv2.LINE_AA,
                )

            # draw track ids (yellow) at last center
            for tr in tracks:
                cx, cy = tr["last_center"]
                px = to_int(cx * W)
                py = to_int(cy * H)
                cv2.circle(dbg, (px, py), 6, (0, 255, 255), -1)
                cv2.putText(
                    dbg,
                    f"id={tr['id']}",
                    (px + 8, py - 8),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (0, 255, 255),
                    2,
                    cv2.LINE_AA,
                )

            writer.write(dbg)
            written += 1
            if debug_max_frames and written >= debug_max_frames:
                break

        frame_idx += 1

    cap.release()
    mp_fd.close()
    mp_fm.close()
    if writer is not None:
        writer.release()

    all_tracks = finished_tracks + tracks
    faces = []
    for tr in all_tracks:
        if len(tr["timeline"]) >= min_track_points:
            faces.append({"id": tr["id"], "timeline": tr["timeline"]})

    return {
        "clipPath": os.path.abspath(clip_path),
        "fps": float(fps),
        "duration": float(duration),
        "faces": faces,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--clips", nargs="+", required=True, help="List of clip paths")
    parser.add_argument("--sample-stride", type=int, default=2)
    parser.add_argument("--debug-out", type=str, default=None)
    parser.add_argument("--debug-max-frames", type=int, default=0)
    args = parser.parse_args()

    results = []
    for clip in args.clips:
        results.append(
            analyze_clip(
                clip,
                sample_stride=args.sample_stride,
                debug_out=args.debug_out,
                debug_max_frames=args.debug_max_frames,
            )
        )

    json.dump(results, sys.stdout)
    sys.stdout.flush()


if __name__ == "__main__":
    main()
