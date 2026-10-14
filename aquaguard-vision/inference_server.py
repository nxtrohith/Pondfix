"""
inference_server.py — AquaGuard Vision Computer Vision Service (Phase 1)

Model: Ultralytics YOLO-World (open-vocabulary) prompted with "fish". The generic COCO yolov8n has no fish class and
returned nothing useful on fish, so the default is now weights/yolov8s-worldv2.pt. Any fish-trained YOLO .pt also works.
Server listens on 0.0.0.0:5001. All data is processed locally.

Usage:
  pip install ultralytics flask pillow      (the venv also needs the `clip` package that ultralytics installs for YOLO-World)
  python inference_server.py

Environment:
  FISH_MODEL    weights path (default weights/yolov8s-worldv2.pt). A path containing "world" is loaded as YOLO-World.
  FISH_PROMPTS  comma-separated text prompts for YOLO-World (default "fish"), e.g. "fish,koi"
  FISH_CLASSES  optional class names to keep for ordinary (non-World) models
  FISH_CONF     confidence threshold (default 0.25)
  PORT          listen port (default 5001)

Offline files: YOLO-World needs weights/yolov8s-worldv2.pt and weights/clip/ViT-B-32.pt next to this file. They are
git-ignored; if Python's HTTPS downloads fail on your network, fetch them with curl (see README).
"""


import base64
import io
import os
import time
import logging
from flask import Flask, request, jsonify
from PIL import Image

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [AQUAFIX] %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("aquafix")

# Ultralytics resolves its relative "weights/" folder (YOLO-World's CLIP text model) against the working directory.
os.chdir(os.path.dirname(os.path.abspath(__file__)))

try:
    MODEL_PATH = os.environ.get("FISH_MODEL", "weights/yolov8s-worldv2.pt")
    logger.info("Loading model: %s", MODEL_PATH)
    if "world" in os.path.basename(MODEL_PATH).lower():
        from ultralytics import YOLOWorld

        model = YOLOWorld(MODEL_PATH)
        prompts = [p.strip() for p in os.environ.get("FISH_PROMPTS", "fish").split(",") if p.strip()]
        model.set_classes(prompts)
    else:
        from ultralytics import YOLO

        model = YOLO(MODEL_PATH)
    MODEL_NAME = os.path.basename(MODEL_PATH)
    MODEL_LOADED = True
    logger.info("Model loaded: %s | classes: %s", MODEL_NAME, model.names)
    if "fish" not in {str(n).lower() for n in model.names.values()} and not os.environ.get("FISH_CLASSES"):
        logger.warning("This model has no 'fish' class; use a fish model (or YOLO-World) or set FISH_CLASSES.")
except Exception as exc:
    logger.error("Failed to load YOLO model: %s", exc)
    model = None
    MODEL_NAME = "unavailable"
    MODEL_LOADED = False

# Optional comma-separated class names to keep (default: keep every class the model outputs).
KEEP_CLASSES = {c.strip().lower() for c in os.environ.get("FISH_CLASSES", "").split(",") if c.strip()}
CONF_THRESHOLD = float(os.environ.get("FISH_CONF", "0.25"))

app = Flask(__name__)
_frame_count = 0


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": MODEL_NAME, "model_loaded": MODEL_LOADED})


@app.route("/detect", methods=["POST"])
def detect():
    global _frame_count
    _frame_count += 1

    if not MODEL_LOADED:
        return jsonify({
            "error": "Model not loaded",
            "detections": [],
            "inference_ms": 0,
            "model": MODEL_NAME,
            "frame_count": _frame_count,
        }), 503

    data = request.get_json(force=True, silent=True)
    if not data or "image" not in data:
        return jsonify({"error": "Missing 'image' field", "detections": []}), 400

    try:
        img_bytes = base64.b64decode(data["image"])
        image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception as exc:
        logger.warning("Failed to decode image: %s", exc)
        return jsonify({"error": f"Image decode error: {exc}", "detections": []}), 400

    t0 = time.perf_counter()
    try:
        results = model(image, conf=CONF_THRESHOLD, verbose=False)
    except Exception as exc:
        logger.error("Inference error: %s", exc)
        return jsonify({"error": f"Inference error: {exc}", "detections": []}), 500

    inference_ms = (time.perf_counter() - t0) * 1000
    frame_w, frame_h = image.size
    detections = []

    for result in results:
        boxes = result.boxes
        if boxes is None:
            continue
        for box in boxes:
            cls_id = int(box.cls[0])
            label = result.names.get(cls_id, str(cls_id)).lower()
            if KEEP_CLASSES and label not in KEEP_CLASSES:
                continue
            conf = float(box.conf[0])
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]

            detections.append({
                "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                "confidence": conf,
                "label": label,
            })

    logger.info(
        "Frame %d | %d detections | %.1f ms",
        _frame_count,
        len(detections),
        inference_ms,
    )
    for d in detections:
        logger.info(
            "  [FISH_BEHAVIOUR] label=%s conf=%.2f bbox=[%.0f,%.0f,%.0f,%.0f]",
            d["label"],
            d["confidence"],
            d["bbox"]["x1"],
            d["bbox"]["y1"],
            d["bbox"]["x2"],
            d["bbox"]["y2"],
        )

    return jsonify({
        "detections": detections,
        "inference_ms": round(inference_ms, 2),
        "model": MODEL_NAME,
        "frame_count": _frame_count,
        "frame_size": {"width": frame_w, "height": frame_h},
    })


if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info(" AquaGuard Vision Inference Server")
    logger.info(" Listening on http://0.0.0.0:5001")
    logger.info(" Phone and PC must be on same Wi-Fi")
    logger.info("=" * 60)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5001")), debug=False, threaded=True)
