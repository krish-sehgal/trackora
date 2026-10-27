# Trackora backend

FastAPI endpoint for detecting likely potholes in road-video clips no longer than 10 seconds.

## Setup

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open `http://127.0.0.1:8000/docs` to use the interactive API documentation.

## Request

```powershell
curl.exe -X POST "http://127.0.0.1:8000/api/v1/potholes/detect" -F "video=@road-clip.mp4"
```

The service accepts MP4, MOV, AVI, and WebM files up to 100 MB. Videos longer than 10 seconds are rejected with HTTP 422. The built-in detector is an OpenCV visual baseline; it is ready to be replaced by a trained pothole model for dependable real-world results.
