#!/usr/bin/env python3
"""
demo_fish_video.py — AquaGuard standalone demo (no phone app, no server).

Plays fishy1.mp4 then fishy2.mp4 in a window with live bounding boxes, tracks each
fish, and prints console logs. A fish that barely moves for a few seconds raises a
clear "LOW MOVEMENT" alert (box turns red); it logs again when the fish recovers.

Run:      python3 demo_fish_video.py
Options:  --videos fishy2.mp4        only play some videos
          --conf 0.12                detection confidence
          --still-secs 3             seconds of low movement before alerting
          --still-thresh 0.15        movement (in body-lengths) below which a fish counts as still
          --max-secs 7               seconds of each video to play (0 = whole video)
          --save                     also write annotated copies to demo_output/
          --no-window                headless (logs only)
Keys:     q = quit, n = skip to next video, space = pause

Model: YOLO-World (weights/yolov8s-worldv2.pt, open-vocabulary) prompted with "fish".
The old fallback (COCO yolov8n) has no fish class, so it could not detect fish.
Requirements: pip install ultralytics opencv-python
"""
import argparse
import os
import sys
import textwrap
import time
from collections import defaultdict, deque

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(HERE, "weights", "yolov8s-worldv2.pt")
PROMPTS = ["fish"]
TRACKER_CFG = os.path.join(HERE, "demo_tracker.yaml")

GREEN, RED, WHITE, BLACK = (60, 200, 60), (40, 40, 230), (255, 255, 255), (0, 0, 0)


def color(code, s):
    return f"\033[{code}m{s}\033[0m" if sys.stdout.isatty() else s


def stamp(frame_idx, fps):
    t = frame_idx / fps
    return f"[{int(t // 60):02d}:{t % 60:05.2f}]"


def run_video(model, path, args):
    """Returns False if the user asked to quit entirely."""
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        print(f"Cannot open {path}")
        return True, {"frames": 0}
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w, h = int(cap.get(3)), int(cap.get(4))
    name = os.path.basename(path)
    win = f"AquaGuard demo - {name}"
    hist_len = int(args.still_secs * fps) + 1

    writer = None
    if args.save:
        os.makedirs(os.path.join(HERE, "demo_output"), exist_ok=True)
        writer = cv2.VideoWriter(os.path.join(HERE, "demo_output", f"annotated_{name}"),
                                 cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))

    print()
    print(color("1;36", "=" * 78))
    print(color("1;36", f" VIDEO: {name}  ({w}x{h}, {fps:.0f} fps, {total} frames)"))
    print(color("1;36", "=" * 78))

    trails = defaultdict(lambda: deque(maxlen=hist_len))   # id -> (cx, cy)
    sizes = defaultdict(lambda: deque(maxlen=hist_len))    # id -> box diagonal
    alerting = {}                                          # id -> frame the alert began
    seen_ids = set()
    alert_count = 0
    fish_stats = {}                                        # id -> per-fish accumulators for the final report
    fish_per_frame = []                                    # number of fish visible in each processed frame
    frames_with_alert = 0
    idx = 0
    paused = False
    vis = None
    keep_going = True
    t0 = time.time()

    while True:
        if not paused:
            ok, frame = cap.read()
            if not ok or (args.max_secs and idx >= args.max_secs * fps):
                break
            res = model.track(frame, persist=True, tracker=TRACKER_CFG,
                              conf=args.conf, iou=0.5, imgsz=args.imgsz, verbose=False)[0]
            boxes = res.boxes
            ids = boxes.id.int().tolist() if boxes.id is not None else []
            xyxy = boxes.xyxy.cpu().numpy() if boxes.id is not None else np.empty((0, 4))
            confs = boxes.conf.cpu().numpy() if boxes.id is not None else []

            rows = []
            for tid, (x1, y1, x2, y2), cf in zip(ids, xyxy, confs):
                cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
                trails[tid].append((cx, cy))
                sizes[tid].append(float(np.hypot(x2 - x1, y2 - y1)))

                # Movement over the window, in body-lengths (scale-independent).
                moved = None
                if len(trails[tid]) >= hist_len:
                    pts = np.array(trails[tid])
                    span = float(np.hypot(*(pts.max(axis=0) - pts.min(axis=0))))
                    moved = span / max(float(np.mean(sizes[tid])), 1.0)
                # Hysteresis: start alerting below the threshold, only clear above 2x it,
                # so borderline fish don't flicker between states.
                if tid in alerting:
                    is_still = moved is None or moved < args.still_thresh * 2
                else:
                    is_still = moved is not None and moved < args.still_thresh

                if tid not in seen_ids:
                    seen_ids.add(tid)
                    print(f"{stamp(idx, fps)} {color('32', 'NEW FISH')}  id={tid} conf={cf:.2f}")
                if is_still and tid not in alerting:
                    alerting[tid] = idx
                    alert_count += 1
                    print(color("1;41;97",
                                f" ALERT {stamp(idx, fps)} FISH #{tid} LOW MOVEMENT - moved only "
                                f"{moved:.2f} body-lengths in {args.still_secs:.0f}s at ({cx:.0f},{cy:.0f}) "))
                elif not is_still and tid in alerting:
                    print(color("33", f"{stamp(idx, fps)} RECOVERED   fish #{tid} moving again "
                                      f"(after {(idx - alerting[tid]) / fps:.1f}s)"))
                    del alerting[tid]
                rows.append((tid, (x1, y1, x2, y2), cf, moved, tid in alerting))
                fs = fish_stats.setdefault(tid, {"first": idx, "last": idx, "frames": 0, "conf": 0.0,
                                                 "still_frames": 0, "alerts": 0, "moved_sum": 0.0, "moved_n": 0})
                fs["last"] = idx
                fs["frames"] += 1
                fs["conf"] += float(cf)
                if tid in alerting:
                    fs["still_frames"] += 1
                if alerting.get(tid) == idx:
                    fs["alerts"] += 1
                if moved is not None:
                    fs["moved_sum"] += moved
                    fs["moved_n"] += 1

            # Console summary twice per second of video.
            if idx % max(int(fps / 2), 1) == 0:
                detail = " ".join(
                    f"#{t}:{('%.2f' % m) if m is not None else '--'}{'!' if a else ''}"
                    for t, _, _, m, a in rows)
                print(f"{stamp(idx, fps)} frame={idx:4d} fish={len(rows):2d} "
                      f"still={sum(1 for r in rows if r[4]):2d} | movement(body-lengths): {detail}")

            fish_per_frame.append(len(rows))
            if any(r[4] for r in rows):
                frames_with_alert += 1

            vis = frame.copy()
            for tid, (x1, y1, x2, y2), cf, moved, alert in rows:
                col = RED if alert else GREEN
                p1, p2 = (int(x1), int(y1)), (int(x2), int(y2))
                cv2.rectangle(vis, p1, p2, col, 3 if alert else 2)
                label = f"#{tid} {cf:.2f}" + (" LOW MOVEMENT" if alert else "")
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                cv2.rectangle(vis, (p1[0], p1[1] - th - 8), (p1[0] + tw + 6, p1[1]), col, -1)
                cv2.putText(vis, label, (p1[0] + 3, p1[1] - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, WHITE, 1, cv2.LINE_AA)
            n_alert = sum(1 for r in rows if r[4])
            cv2.rectangle(vis, (0, 0), (w, 36), RED if n_alert else BLACK, -1)
            cv2.putText(vis, f"{name} | fish: {len(rows)} | low movement: {n_alert}", (10, 25),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, WHITE, 2, cv2.LINE_AA)
            if writer:
                writer.write(vis)
            idx += 1

        if not args.no_window and vis is not None:
            cv2.imshow(win, vis)
            # Pace to real time (only waits if inference is faster than the video).
            wait = max(1, int((idx / fps - (time.time() - t0)) * 1000))
            key = cv2.waitKey(wait) & 0xFF
            if key == ord("q"):
                keep_going = False
                break
            if key == ord("n"):
                break
            if key == ord(" "):
                paused = not paused

    cap.release()
    if writer:
        writer.release()
    if not args.no_window:
        cv2.destroyWindow(win)
        cv2.waitKey(1)
    print(color("1;36", f"--- {name} done: {len(seen_ids)} fish tracked, {alert_count} low-movement "
                        f"alerts, {idx / max(time.time() - t0, 1e-6):.1f} fps processed ---"))
    summary = {
        "name": name, "fps": fps, "frames": idx, "seconds": idx / fps, "fish": fish_stats,
        "alerts": alert_count, "frames_with_alert": frames_with_alert,
        "max_fish": max(fish_per_frame, default=0),
        "avg_fish": float(np.mean(fish_per_frame)) if fish_per_frame else 0.0,
        "proc_fps": idx / max(time.time() - t0, 1e-6),
    }
    return keep_going, summary


def print_final_report(summaries):
    """Clear end-of-run statistics: per video, per fish, and overall."""
    bar = "=" * 78
    print()
    print(color("1;36", bar))
    print(color("1;36", " FINAL REPORT - AquaGuard fish movement demo"))
    print(color("1;36", bar))
    if not summaries:
        print(" No video was processed.")
        return
    tot_fish = tot_alerts = tot_frames = 0
    tot_secs = 0.0
    for sm in summaries:
        pct = 100.0 * sm["frames_with_alert"] / sm["frames"] if sm["frames"] else 0.0
        print()
        print(color("1", f" VIDEO: {sm['name']}"))
        print(f"   Processed          : {sm['frames']} frames ({sm['seconds']:.1f}s of video, {sm['proc_fps']:.1f} fps processing speed)")
        print(f"   Unique fish tracked: {len(sm['fish'])}   (max at once: {sm['max_fish']}, average per frame: {sm['avg_fish']:.1f})")
        print(f"   Low-movement alerts: {sm['alerts']}   ({sm['frames_with_alert']} frames = {pct:.0f}% of video had a fish alerting)")
        if sm["fish"]:
            print("   " + "-" * 74)
            print("   {:>5} {:>9} {:>8} {:>9} {:>7} {:>11} {:>12}".format(
                "Fish", "Seen(s)", "Visible", "Avg conf", "Alerts", "Still time", "Avg move"))
            print("   {:>5} {:>9} {:>8} {:>9} {:>7} {:>11} {:>12}".format(
                "", "first-last", "frames", "", "", "(seconds)", "(body-len)"))
            for tid, f in sorted(sm["fish"].items()):
                span = f"{f['first'] / sm['fps']:.1f}-{f['last'] / sm['fps']:.1f}"
                avg_move = f"{f['moved_sum'] / f['moved_n']:.2f}" if f["moved_n"] else "--"
                line = "   {:>5} {:>9} {:>8} {:>9.2f} {:>7} {:>11.1f} {:>12}".format(
                    f"#{tid}", span, f["frames"], f["conf"] / f["frames"], f["alerts"],
                    f["still_frames"] / sm["fps"], avg_move)
                print(color("31", line) if f["alerts"] else line)
        tot_fish += len(sm["fish"])
        tot_alerts += sm["alerts"]
        tot_frames += sm["frames"]
        tot_secs += sm["seconds"]
    print()
    print(color("1;36", "-" * 78))
    print(color("1", f" OVERALL: {len(summaries)} video(s), {tot_frames} frames ({tot_secs:.1f}s), "
                     f"{tot_fish} fish tracked, {tot_alerts} low-movement alert(s)"))
    print(color("1;36", "-" * 78))
    print(" Note: fish IDs restart for each video; 'Avg move' is movement over the alert window in body-lengths.")
    print_description(summaries)


def print_description(summaries):
    """Plain-language narrative of the run, one paragraph per video plus an overall verdict."""
    print()
    print(color("1;36", "=" * 78))
    print(color("1;36", " WHAT THE STATS MEAN (plain-language summary)"))
    print(color("1;36", "=" * 78))
    for sm in summaries:
        fish = sm["fish"]
        n = len(fish)
        # Fish seen for under a second are most likely tracker flicker / false detections, not real animals.
        brief = [t for t, f in fish.items() if f["frames"] / sm["fps"] < 1.0]
        lasting = {t: f for t, f in fish.items() if t not in brief}
        flagged = {t: f for t, f in lasting.items() if f["alerts"]}
        pct = 100.0 * sm["frames_with_alert"] / sm["frames"] if sm["frames"] else 0.0
        lines = [f"In '{sm['name']}', {sm['seconds']:.1f} seconds of video were analysed and the model assigned "
                 f"{n} fish IDs. Typically {sm['avg_fish']:.0f} fish were visible at a time (up to {sm['max_fish']})."]
        if brief:
            lines.append(f"{len(brief)} of those IDs lasted under a second; these are probably brief detections or "
                         f"tracker ID switches rather than separate fish, so the real count is nearer {len(lasting)}.")
        if not lasting:
            lines.append("No fish stayed in view long enough to judge their movement.")
        elif not flagged:
            lines.append("Every fish that stayed in view kept moving normally - no low-movement alerts were raised.")
        else:
            share = 100.0 * len(flagged) / len(lasting)
            longest_tid, longest = max(flagged.items(), key=lambda kv: kv[1]["still_frames"])
            lines.append(f"{len(flagged)} of {len(lasting)} lasting fish ({share:.0f}%) showed LOW MOVEMENT at some point "
                         f"({sm['alerts']} alerts in total). At least one fish was flagged during {pct:.0f}% of the video. "
                         f"The longest-still fish was #{longest_tid}, barely moving for "
                         f"{longest['still_frames'] / sm['fps']:.1f}s.")
            moves = [f["moved_sum"] / f["moved_n"] for f in lasting.values() if f["moved_n"]]
            if moves:
                lines.append(f"Average movement across the window was {np.mean(moves):.2f} body-lengths "
                             f"(alerts trigger below the --still-thresh limit, so lower values mean a more stationary fish).")
        print()
        print(" " + textwrap.fill(" ".join(lines), width=76, subsequent_indent=" "))
    total_alerts = sum(sm["alerts"] for sm in summaries)
    print()
    verdict = ("No fish showed signs of reduced movement." if not total_alerts else
               f"Overall: {total_alerts} low-movement alert(s) were raised across {len(summaries)} video(s). "
               "This is a visual indicator only (movement seen from the camera), not a diagnosis of fish health.")
    print(color("1", " " + textwrap.fill(verdict, width=76, subsequent_indent=" ")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--videos", nargs="*", default=["fishy1.mp4", "fishy2.mp4"])
    ap.add_argument("--conf", type=float, default=0.12)
    ap.add_argument("--imgsz", type=int, default=960)
    ap.add_argument("--still-secs", type=float, default=3.0)
    ap.add_argument("--still-thresh", type=float, default=0.15)
    ap.add_argument("--max-secs", type=float, default=7.0, help="seconds of each video to play (0 = full)")
    ap.add_argument("--save", action="store_true")
    ap.add_argument("--no-window", action="store_true")
    args = ap.parse_args()

    from ultralytics import YOLO
    print("Loading model:", MODEL_PATH)
    summaries = []
    for v in args.videos:
        # Fresh model per video so tracker IDs/state reset.
        model = YOLO(MODEL_PATH)
        model.set_classes(PROMPTS)
        path = v if os.path.isabs(v) else os.path.join(HERE, v)
        keep_going, summary = run_video(model, path, args)
        if summary["frames"]:
            summaries.append(summary)
        if not keep_going:
            break
    cv2.destroyAllWindows()
    print_final_report(summaries)


if __name__ == "__main__":
    main()
