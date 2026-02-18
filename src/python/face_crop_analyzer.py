import os
import sys

os.environ['MEDIAPIPE_DISABLE_GPU'] = '1'
os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

os.environ['LD_LIBRARY_PATH'] = '/usr/lib/x86_64-linux-gnu'
os.environ['OPENCV_VIDEOIO_PRIORITY_MSMF'] = '0'

import argparse
import json
import math
import cv2
from typing import List, Dict, Any, Optional, Tuple
import mediapipe as mp

mp_face_detection = mp.solutions.face_detection
mp_face_mesh = mp.solutions.face_mesh

cv2.setUseOptimized(True)
cv2.ocl.setUseOpenCL(False)

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
        max_assign_dist: float = 0.28,
        min_iou_gate: float = 0.01,
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

    mp_fd = mp_face_detection.FaceDetection(
        model_selection=0,
        min_detection_confidence=0.30
    )

    mp_fm = mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=False,
        min_detection_confidence=0.5,
    )

    tracks: List[Dict[str, Any]] = []
    finished_tracks: List[Dict[str, Any]] = []
    next_id = 0

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

        # OPTIMIZARE: Analizam doar fiecare al 5-lea cadru
        if frame_idx % 5 != 0:
            frame_idx += 1
            continue

        t = frame_idx / fps
        H_orig, W_orig = frame.shape[:2]

        # OPTIMIZARE: Redimensionam pentru analiza rapida (MediaPipe pe CPU)
        analyze_width = 640
        analyze_height = int(H_orig * (640 / W_orig))
        small_frame = cv2.resize(frame, (analyze_width, analyze_height))
        rgb_small = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
        H_small, W_small = small_frame.shape[:2]

        det_results = mp_fd.process(rgb_small)
        detections: List[Dict[str, Any]] = []

        if det_results.detections:
            for det in det_results.detections:
                loc = det.location_data
                if not loc.HasField("relative_bounding_box"):
                    continue
                bb = loc.relative_bounding_box

                # Coordonatele sunt normalizate (0.0 - 1.0), deci raman valabile
                cx = clamp01(bb.xmin + bb.width / 2.0)
                cy = clamp01(bb.ymin + bb.height / 2.0)
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

        # Calculam mouth openness pe ROI din imaginea mica
        for d in detections:
            x0, y0, x1, y1 = norm_bbox_to_px(d["bbox"], W_small, H_small)
            roi = rgb_small[y0:y1, x0:x1]
            if roi.size == 0:
                continue

            mesh_res = mp_fm.process(roi)
            if mesh_res.multi_face_landmarks:
                lm = mesh_res.multi_face_landmarks[0].landmark
                d["mouth"] = float(mouth_openness_from_landmarks(lm))

        # Tracking logic (aceasta ramane neschimbata dar foloseste detections de mai sus)
        used = set()
        alive_tracks = []
        for tr in tracks:
            if (t - tr.get("last_t", -1e9)) <= max_missed_sec:
                alive_tracks.append(tr)
            else:
                finished_tracks.append(tr)
        tracks = alive_tracks
        tracks.sort(key=lambda tr: tr.get("last_t", -1), reverse=True)

        for tr in tracks:
            best_j = None
            best_score = 1e9
            for j, det in enumerate(detections):
                if j in used: continue
                d = euclid((det["cx"], det["cy"]), tr["last_center"])
                if d > max_assign_dist: continue
                ov = iou(det["bbox"], tr["last_bbox_edges"])
                if ov < min_iou_gate: continue
                score = d - 0.15 * ov
                if score < best_score:
                    best_score = score
                    best_j = j

            if best_j is not None:
                det = detections[best_j]
                used.add(best_j)
                tr["timeline"].append({
                    "t": float(t), "x": det["cx"], "y": det["cy"],
                    "w": det["w"], "h": det["h"], "mouth": det["mouth"],
                })
                tr["last_center"] = (det["cx"], det["cy"])
                prev = tr["last_bbox_edges"]
                cur = det["bbox"]
                alpha = 0.7
                tr["last_bbox_edges"] = {
                    "x0": alpha * prev["x0"] + (1 - alpha) * cur["x0"],
                    "y0": alpha * prev["y0"] + (1 - alpha) * cur["y0"],
                    "x1": alpha * prev["x1"] + (1 - alpha) * cur["x1"],
                    "y1": alpha * prev["y1"] + (1 - alpha) * cur["y1"],
                }
                tr["last_t"] = t
                tr["missed_sec"] = 0.0

        for j, det in enumerate(detections):
            if j in used: continue
            tracks.append({
                "id": next_id,
                "last_center": (det["cx"], det["cy"]),
                "last_bbox_edges": det["bbox"],
                "last_t": t,
                "missed_sec": 0.0,
                "timeline": [{
                    "t": float(t), "x": det["cx"], "y": det["cy"],
                    "w": det["w"], "h": det["h"], "mouth": det["mouth"],
                }],
            })
            next_id += 1

        # Debug draw corectat sa foloseasca W_orig, H_orig
        if writer is not None:
            dbg = frame.copy()
            for d in detections:
                x0, y0, x1, y1 = norm_bbox_to_px(d["bbox"], W_orig, H_orig)
                cv2.rectangle(dbg, (x0, y0), (x1, y1), (0, 255, 0), 2)
            writer.write(dbg)
            written += 1
            if debug_max_frames and written >= debug_max_frames: break

        frame_idx += 1

    cap.release()
    mp_fd.close()
    mp_fm.close()
    if writer is not None: writer.release()

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

    output_json = json.dumps(results)
    sys.stdout.write(output_json)
    sys.stdout.flush()

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        sys.stderr.write(f"Python script error: {str(e)}\n")
        sys.exit(1)