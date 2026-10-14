# PondFix Vision — Mobile Fish Activity Monitor (Phase 1 PoC)

A standalone mobile application and local computer-vision inference pipeline for detecting fish, tracking movement across consecutive frames, and identifying sustained inactivity in aquaculture environments.

---

## Architecture Overview

```
┌─────────────────────────────────┐           HTTP POST (base64 JPEG)
│  PondFix Vision Mobile App    │ ──────────────────────────────────────────► ┌────────────────────────────────────────┐
│  (Expo Go / React Native)       │                                             │  inference_server.py (Flask + YOLOv8)  │
│  - Live Camera Preview          │ ◄────────────────────────────────────────── │  - Ultralytics YOLOv8 inference        │
│  - Real-time Bounding Boxes     │           JSON Detections + Coordinates     │  - Fish detection bounding boxes       │
│  - Centroid Tracker & Dynamics  │                                             │  - Runs locally on PC (port 5001)      │
│  - Inactivity & Still Alerts    │                                             └────────────────────────────────────────┘
│  - Terminal Metric Logger       │
└─────────────────────────────────┘
```

---

## Features

1. **Live Camera Feed**: Real-time camera viewfinder rendered via `expo-camera` (`CameraView`).
2. **Local AI Computer Vision**: Sends frames to `inference_server.py` running on your PC (zero external cloud dependencies).
3. **Dynamic Bounding Box Overlay**: Pure React Native View overlays color-coded by behavior:
   - 🟢 **Active**: Normal movement & swimming dynamics.
   - 🟡 **Low Activity**: Sustained low speed below threshold.
   - 🔴 **Possibly motionless**: smoothed speed under 1 px/s for 15 s while reliably tracked (visual inactivity only, not a diagnosis).
   - ⚪ **Tracking uncertain** (fish not matched in the latest frame) and 🔵 **Unknown** (not enough history yet) are never forced into a class.
4. **Multi-Object Tracking (MOT)**: Centroid Euclidean distance matching across frames with occlusion grace periods.
5. **Kinematic Metrics**: Computes instantaneous displacement (px), speed (px/s), heading angle (0–360°), and moving average speed.
6. **Development Terminal Logging**: Outputs structured `[AQUAFIX_FRAME]` and `[FISH_BEHAVIOUR]` metric records every 5 frames.

---

## Setup & Running

### Step 1: Start the Local Computer Vision Server
Open a terminal on your PC:
```bash
cd aquaguard-vision
pip install ultralytics flask pillow
python inference_server.py   # default model: YOLO-World prompted with "fish"
```
*Note: The server will listen on `http://0.0.0.0:5001`. On first run, it will automatically download YOLOv8n weights (`yolov8n.pt`).*

### Step 2: Start the Mobile App
Open another terminal:
```bash
cd aquaguard-vision
npx expo start
```
Scan the QR code using the **Expo Go** app on your iOS or Android mobile device.
*(Ensure your phone and PC are connected to the same Wi-Fi network).*

---

## Configuration

If your PC's local Wi-Fi IP is not `172.16.20.24`, update `inferenceUrl` in:
- `app.json`: `extra.inferenceUrl`
- Or `src/lib/inferenceService.ts`: `DEFAULT_SERVER_URL`


---

## Behaviour classification and tuning

Logic lives in `src/lib/` (`fishTracker.ts` association + movement, `behaviourClassifier.ts` state machine, `fishStats.ts` live counts); every threshold is in `behaviourConfig.ts`. Pass overrides to `new FishTracker({...})`.

| Setting | Default | Meaning |
|---|---|---|
| `observationWindowS` | 5 | rolling window for the smoothed speed |
| `lowActivitySpeed` / `lowActivityExitSpeed` | 5 / 7 px/s | enter / leave LOW_ACTIVITY |
| `motionlessSpeed` / `motionlessExitSpeed` | 1 / 2 px/s | enter / leave POSSIBLY_MOTIONLESS |
| `lowActivityMinS` / `motionlessMinS` | 5 / 15 s | sustained time required |
| `missedGraceS` | 1 s | gap after which a reacquired fish restarts its timers |
| `noiseFloorPx`, `noiseFloorBoxFraction` | 2 px, 2 % of box diagonal | movement smaller than this is jitter |

Speeds are image-plane pixels per second after rescaling to a 640 px reference width, not cm/s. To tune: a camera further away or zoomed out makes fish move fewer pixels, so lower the speed thresholds; larger fish in frame need higher ones; if a still fish shows speed above 0 in the `[AQUAGUARD_SUMMARY]` log, raise the noise floor rather than the speed thresholds. With the default 1.5 s capture interval, one missed detection is a 3 s gap, so raise `missedGraceS` (e.g. 4) if you want single misses bridged.

Tests: `npm test` (Node's built-in runner, synthetic fixtures only).

---

## Detection model

The generic `yolov8n.pt` (COCO) has no fish class, so it detects nothing useful on fish and every counter stays at 0. The server now defaults to **YOLO-World** (`weights/yolov8s-worldv2.pt`) prompted with `fish`. It needs two git-ignored files next to `inference_server.py`:

```bash
mkdir -p weights/clip
curl -L -o weights/yolov8s-worldv2.pt https://github.com/ultralytics/assets/releases/download/v8.4.0/yolov8s-worldv2.pt
curl -L -o weights/clip/ViT-B-32.pt https://openaipublic.azureedge.net/clip/models/40d365715913c9da98579312b702a82c18be219cc2a73407c4526f58eba950af/ViT-B-32.pt
shasum -a 256 weights/clip/ViT-B-32.pt   # must start with 40d36571
```
(Use curl if Python's own HTTPS downloads fail with `CERTIFICATE_VERIFY_FAILED`.) Environment: `FISH_MODEL` (any fish-trained YOLO `.pt`, best for accuracy on your own pond footage), `FISH_PROMPTS`, `FISH_CONF`, `PORT`. The server logs every detection (label, confidence, box) and the model's class names at startup.
