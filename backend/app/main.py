from __future__ import annotations

import tempfile
from collections.abc import Generator
from pathlib import Path

import cv2
from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .detector import FrameDetection, detect_potholes

MAX_DURATION_SECONDS = 10.0
MAX_UPLOAD_BYTES = 100 * 1024 * 1024
SAMPLE_RATE_FPS = 2.0
SUPPORTED_TYPES = {"video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"}

app = FastAPI(title="Trackora Pothole Detection API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class BoundingBox(BaseModel):
    x: int
    y: int
    width: int
    height: int


class PotholeDetection(BaseModel):
    timestamp_seconds: float
    confidence: float = Field(ge=0, le=1)
    bounding_box: BoundingBox


class DetectionResponse(BaseModel):
    duration_seconds: float
    frames_analyzed: int
    potholes_detected: int
    detections: list[PotholeDetection]
    detector: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _save_upload(upload: UploadFile) -> Path:
    suffix = Path(upload.filename or "clip.mp4").suffix or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        total = 0
        while chunk := upload.file.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                temp_file.close()
                Path(temp_file.name).unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="Video must be 100 MB or smaller.")
            temp_file.write(chunk)
        return Path(temp_file.name)


def _video_frames(path: Path) -> Generator[tuple[float, object], None, None]:
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise HTTPException(status_code=422, detail="The uploaded file is not a readable video.")
    fps = capture.get(cv2.CAP_PROP_FPS)
    frame_count = capture.get(cv2.CAP_PROP_FRAME_COUNT)
    if fps <= 0 or frame_count <= 0:
        capture.release()
        raise HTTPException(status_code=422, detail="Video metadata is invalid.")
    duration = frame_count / fps
    if duration > MAX_DURATION_SECONDS + 0.05:
        capture.release()
        raise HTTPException(status_code=422, detail="Video must be 10 seconds or shorter.")

    interval = max(1, round(fps / SAMPLE_RATE_FPS))
    index = 0
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            if index % interval == 0:
                yield index / fps, frame
            index += 1
    finally:
        capture.release()


@app.post("/api/v1/potholes/detect", response_model=DetectionResponse)
def detect_video(video: UploadFile = File(...)) -> DetectionResponse:
    """Analyze a road-video clip of up to ten seconds for likely potholes."""
    if video.content_type not in SUPPORTED_TYPES:
        raise HTTPException(status_code=415, detail="Upload an MP4, MOV, AVI, or WebM video.")

    file_path: Path | None = None
    try:
        file_path = _save_upload(video)
        capture = cv2.VideoCapture(str(file_path))
        fps = capture.get(cv2.CAP_PROP_FPS)
        frame_count = capture.get(cv2.CAP_PROP_FRAME_COUNT)
        capture.release()
        if fps <= 0 or frame_count <= 0:
            raise HTTPException(status_code=422, detail="Video metadata is invalid.")
        duration = frame_count / fps
        if duration > MAX_DURATION_SECONDS + 0.05:
            raise HTTPException(status_code=422, detail="Video must be 10 seconds or shorter.")

        raw_detections: list[FrameDetection] = []
        frames_analyzed = 0
        for timestamp, frame in _video_frames(file_path):
            frames_analyzed += 1
            raw_detections.extend(detect_potholes(frame, timestamp))

        detections = [
            PotholeDetection(
                timestamp_seconds=round(item.timestamp_seconds, 3),
                confidence=item.confidence,
                bounding_box=BoundingBox(
                    x=item.bbox[0], y=item.bbox[1], width=item.bbox[2], height=item.bbox[3]
                ),
            )
            for item in raw_detections
        ]
        return DetectionResponse(
            duration_seconds=round(duration, 3),
            frames_analyzed=frames_analyzed,
            potholes_detected=len(detections),
            detections=detections,
            detector="opencv-baseline-heuristic",
        )
    finally:
        if file_path:
            file_path.unlink(missing_ok=True)
        video.file.close()
