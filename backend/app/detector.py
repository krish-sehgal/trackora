"""Video analysis primitives.

The default detector is deliberately conservative: it finds dark, irregular road
surface regions and provides a working API without claiming ML-grade accuracy.
Replace ``detect_potholes`` with a model-backed implementation when trained
weights are available.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class FrameDetection:
    timestamp_seconds: float
    confidence: float
    bbox: tuple[int, int, int, int]


def detect_potholes(frame: np.ndarray, timestamp_seconds: float) -> list[FrameDetection]:
    """Return likely potholes in one BGR frame using a baseline visual heuristic."""
    height, width = frame.shape[:2]
    # Road defects are most likely in the lower part of a forward-facing video.
    roi_top = int(height * 0.35)
    roi = frame[roi_top:, :]
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Very dark areas relative to the frame are candidate depressions/shadows.
    threshold = max(20, int(np.percentile(blurred, 20)))
    mask = cv2.threshold(blurred, threshold, 255, cv2.THRESH_BINARY_INV)[1]
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    detections: list[FrameDetection] = []
    min_area = max(300, int(width * height * 0.0007))
    max_area = int(width * height * 0.12)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in contours:
        area = cv2.contourArea(contour)
        if not min_area <= area <= max_area:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        aspect_ratio = w / max(h, 1)
        if not 0.25 <= aspect_ratio <= 4.0:
            continue
        fill_ratio = area / max(w * h, 1)
        confidence = min(0.85, 0.35 + fill_ratio * 0.35 + area / max_area * 0.25)
        detections.append(
            FrameDetection(timestamp_seconds, round(confidence, 3), (x, y + roi_top, w, h))
        )
    return detections
