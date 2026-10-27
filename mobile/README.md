# Trackora mobile

Expo React Native app that records a 10-second rear-camera road clip, sends it to the Trackora API, and displays the pothole result.

## Connect to the backend

1. Copy `.env.example` to `.env`.
2. Set `EXPO_PUBLIC_API_BASE_URL` to a reachable backend URL. A physical phone must use your computer's LAN IP, not `localhost`.
3. Start the backend on the LAN:

   ```powershell
   cd ..\backend
   .\.venv\Scripts\Activate.ps1
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

## Run

```powershell
cd mobile
npm.cmd install
npx.cmd expo start
```

Open the project in Expo Go on a physical Android or iOS device. Camera recording requires a device; it is not available in a normal desktop browser.
