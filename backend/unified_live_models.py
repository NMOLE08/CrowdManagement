from __future__ import annotations

import argparse
import time
import base64
from collections import deque
from pathlib import Path

import cv2
import numpy as np
import torch
import requests
from ultralytics import YOLO

EMOTION_LABELS = ["angry", "disgust", "fear", "happy", "sad", "surprise", "neutral"]

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Unified real-time webcam pipeline: Mini-Xception + Soft-YOLO + YOLOv8 + YuNet"
    )
    parser.add_argument("--camera", type=int, default=0, help="Camera index")
    parser.add_argument("--width", type=int, default=1280, help="Capture width")
    parser.add_argument("--height", type=int, default=720, help="Capture height")
    parser.add_argument(
        "--models-dir",
        default="../models",
        help="Path to folder containing mini_xception/, openvino_ir/, soft_yolov4/, yolo_crowd/, yolov8/, yunet/",
    )
    parser.add_argument("--conf", type=float, default=0.20, help="Detector confidence threshold")
    parser.add_argument("--iou", type=float, default=0.45, help="Detector IoU threshold")
    parser.add_argument("--imgsz", type=int, default=640, help="YOLO inference size")
    parser.add_argument("--soft-nms-sigma", type=float, default=0.7, help="Soft-NMS gaussian sigma")
    parser.add_argument("--switch-crowd-threshold", type=int, default=35, help="Switch to YOLO-Crowd above this head count")
    parser.add_argument("--emotion-min-conf", type=float, default=0.35, help="Min confidence to display emotion")
    parser.add_argument("--head-ratio", type=float, default=0.45, help="Person box upper ratio used as head proxy")
    
    # API Integration
    parser.add_argument("--push", action="store_true", help="Push processed frames and analytics to dashboard")
    parser.add_argument("--api-url", default="http://localhost:5001/api/v1/model-output", help="Dashboard API endpoint")
    parser.add_argument("--gate-id", type=int, default=2, help="Dashboard Camera ID to update (2 = Gate 1)")
    parser.add_argument("--push-fps", type=int, default=8, help="Max frequency to push to dashboard")
    
    return parser.parse_args()


def compute_iou(b1: list[float], b2: list[float]) -> float:
    xi1, yi1 = max(b1[0], b2[0]), max(b1[1], b2[1])
    xi2, yi2 = min(b1[2], b2[2]), min(b1[3], b2[3])
    inter = max(0.0, xi2 - xi1) * max(0.0, yi2 - yi1)
    a1 = max(0.0, b1[2] - b1[0]) * max(0.0, b1[3] - b1[1])
    a2 = max(0.0, b2[2] - b2[0]) * max(0.0, b2[3] - b2[1])
    return inter / (a1 + a2 - inter + 1e-6)

def soft_nms(boxes: list[list[float]], scores: list[float], sigma: float = 0.7, score_thresh: float = 0.001) -> list[int]:
    n = len(boxes)
    idx = list(range(n))
    for i in range(n):
        max_pos = max(range(i, n), key=lambda p: scores[idx[p]])
        idx[i], idx[max_pos] = idx[max_pos], idx[i]
        for j in range(i + 1, n):
            iou = compute_iou(boxes[idx[i]], boxes[idx[j]])
            scores[idx[j]] *= np.exp(-((iou * iou) / sigma))
    return [k for k in idx if scores[k] > score_thresh]

def nms_xyxy(boxes: np.ndarray, scores: np.ndarray, iou_thr: float = 0.30) -> list[int]:
    if len(boxes) == 0: return []
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = (x2 - x1 + 1) * (y2 - y1 + 1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(int(i))
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        w = np.maximum(0.0, xx2 - xx1 + 1)
        h = np.maximum(0.0, yy2 - yy1 + 1)
        inter = w * h
        iou = inter / (areas[i] + areas[order[1:]] - inter + 1e-6)
        inds = np.where(iou <= iou_thr)[0]
        order = order[inds + 1]
    return keep

def derive_head_boxes(person_boxes: np.ndarray, head_ratio: float) -> np.ndarray:
    if len(person_boxes) == 0: return np.zeros((0, 4), dtype=np.float32)
    out = []
    for x1, y1, x2, y2 in person_boxes:
        h = max(1.0, y2 - y1)
        out.append([x1, y1, x2, y1 + head_ratio * h])
    return np.array(out, dtype=np.float32)

def face_inside_any_head(face_xyxy: list[int], head_boxes: np.ndarray) -> bool:
    if len(head_boxes) == 0: return False
    cx, cy = (face_xyxy[0] + face_xyxy[2]) / 2.0, (face_xyxy[1] + face_xyxy[3]) / 2.0
    for hb in head_boxes:
        if hb[0] <= cx <= hb[2] and hb[1] <= cy <= hb[3]: return True
    return False

def expand_face_to_head(face_xyxy: list[int], fw: int, fh: int) -> list[int]:
    x1, y1, x2, y2 = face_xyxy
    w, h = max(1, x2 - x1), max(1, y2 - y1)
    cx = (x1 + x2) / 2.0
    hw, hh = 1.8 * w, 2.1 * h
    hx1 = int(max(0, cx - hw / 2.0))
    hy1 = int(max(0, y1 - 0.25 * h))
    hx2, hy2 = int(min(fw - 1, hx1 + hw)), int(min(fh - 1, hy1 + hh))
    return [hx1, hy1, hx2, hy2]

def load_mini_xception(model_path: Path):
    if not model_path.exists(): return None
    try:
        from tensorflow.keras.models import load_model
        return load_model(str(model_path), compile=False)
    except Exception as exc:
        print(f"[WARN] Mini-Xception unavailable ({exc})")
        return None

def predict_emotion(model, gray_face_roi: np.ndarray) -> dict | None:
    if model is None or gray_face_roi.size == 0: return None
    roi = cv2.resize(gray_face_roi, (64, 64)).astype("float32") / 255.0
    roi = np.expand_dims(roi, axis=(0, -1))
    preds = model.predict(roi, verbose=0)[0]
    k = int(np.argmax(preds))
    return {
        "label": EMOTION_LABELS[k],
        "confidence": float(np.max(preds)),
        "scores": {e: float(preds[i]) for i, e in enumerate(EMOTION_LABELS)}
    }

def push_to_dashboard(api_url: str, gate_id: int, count: int, frame: np.ndarray, emotions: list[str]):
    try:
        _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
        frame_b64 = base64.b64encode(buffer).decode("utf-8")
        
        # Determine dominant emotion
        dom_emotion = "Calm"
        if emotions:
            from collections import Counter
            dom_emotion = Counter(emotions).most_common(1)[0][0].capitalize()

        payload = {
            "cameras": [{
                "id": gate_id,
                "ml_count": count,
                "primary_emotion": dom_emotion,
                "streamUrl": f"data:image/jpeg;base64,{frame_b64}",
                "live": True
            }]
        }
        requests.post(api_url, json=payload, timeout=0.5)
    except Exception as e:
        pass # Silent fail to avoid disrupting the live loop

def main() -> int:
    args = parse_args()
    models_dir = Path(args.models_dir).resolve()

    # Corrected paths based on research
    mini_xception_path = models_dir / "mini_xception" / "mini_xception_fer2013.hdf5"
    yolo_crowd_path = models_dir / "yolo_crowd" / "yolov5s.pt"
    yolov8_path = models_dir / "yolov8" / "yolov8n.pt"
    yunet_path = models_dir / "yunet" / "face_detection_yunet_2023mar.onnx"

    print(f"[INFO] Initializing models from {models_dir}...")
    
    det_crowd = YOLO(str(yolo_crowd_path)) if yolo_crowd_path.exists() else None
    det_base = YOLO(str(yolov8_path)) if yolov8_path.exists() else None
    
    if not yunet_path.exists():
        raise FileNotFoundError(f"YuNet model not found at {yunet_path}")
    face_det = cv2.FaceDetectorYN.create(str(yunet_path), "", (640, 640), 0.3, 0.3, 300)
    
    emotion_model = load_mini_xception(mini_xception_path)
    cap = cv2.VideoCapture(args.camera)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)

    last_count = 0
    last_push_time = 0
    push_interval = 1.0 / args.push_fps

    print("[INFO] Unified logic running. Press 'q' to exit.")
    if args.push:
        print(f"[INFO] Pushing real-time feed to {args.api_url} for Gate ID {args.gate_id}")

    try:
        while True:
            ok, frame = cap.read()
            if not ok: break
            h, w = frame.shape[:2]
            
            # Select detector
            active = det_crowd if (det_crowd and last_count >= args.switch_crowd_threshold) else det_base
            results = active(frame, conf=args.conf, imgsz=args.imgsz, verbose=False)[0]
            
            raw_boxes = results.boxes.xyxy.cpu().numpy() if len(results.boxes) else np.zeros((0,4))
            raw_confs = results.boxes.conf.cpu().numpy() if len(results.boxes) else np.zeros((0,))
            clss = results.boxes.cls.cpu().numpy() if len(results.boxes) else np.zeros((0,))
            
            person_boxes = raw_boxes[clss == 0]
            person_scores = raw_confs[clss == 0]
            
            head_boxes = derive_head_boxes(person_boxes, args.head_ratio)
            if len(head_boxes) > 0:
                keep = soft_nms(head_boxes.tolist(), person_scores.tolist(), sigma=args.soft_nms_sigma)
                head_boxes = head_boxes[keep]

            # Fused Face logic
            face_det.setInputSize((w, h))
            _, faces = face_det.detect(frame)
            faces = faces if faces is not None else []
            fused_boxes = head_boxes.tolist()
            detected_emotions = []

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            for f in faces[:100]:
                fx, fy, fwf, fhf = [int(v) for v in f[:4]]
                if not face_inside_any_head([fx, fy, fx+fwf, fy+fhf], head_boxes):
                    fused_boxes.append(expand_face_to_head([fx, fy, fx+fwf, fy+fhf], w, h))
                
                # Emotion
                if emotion_model:
                    roi = gray[max(0,fy):fy+fhf, max(0,fx):fx+fwf]
                    if roi.size > 0:
                        res = predict_emotion(emotion_model, roi)
                        if res and res["confidence"] > args.emotion_min_conf:
                            detected_emotions.append(res["label"])
                            cv2.putText(frame, res["label"], (fx, fy-5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,255,0), 1)

            final_heads = np.array(fused_boxes)
            last_count = len(final_heads)

            # Draw
            for hb in final_heads:
                x1, y1, x2, y2 = hb.astype(int)
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)

            cv2.putText(frame, f"Count: {last_count}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            cv2.imshow("Live Feed", frame)

            if args.push and (time.time() - last_push_time > push_interval):
                push_to_dashboard(args.api_url, args.gate_id, last_count, frame, detected_emotions)
                last_push_time = time.time()

            if cv2.waitKey(1) & 0xFF == ord('q'): break
    finally:
        cap.release()
        cv2.destroyAllWindows()
    return 0

if __name__ == "__main__":
    main()