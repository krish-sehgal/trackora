import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const CLIP_SECONDS = 10;
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

type DetectionResponse = {
  duration_seconds: number;
  frames_analyzed: number;
  potholes_detected: number;
};

const videoMetadata = (uri: string) => {
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (extension === 'mov') return { extension: 'mov', type: 'video/quicktime' };
  if (extension === 'avi') return { extension: 'avi', type: 'video/x-msvideo' };
  if (extension === 'webm') return { extension: 'webm', type: 'video/webm' };
  return { extension: 'mp4', type: 'video/mp4' };
};

export default function App() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [result, setResult] = useState<DetectionResponse | null>(null);

  const recordAndAnalyze = async () => {
    if (!cameraRef.current || isRecording || isUploading) return;
    if (!API_BASE_URL) {
      Alert.alert('Backend URL missing', 'Set EXPO_PUBLIC_API_BASE_URL in your .env file.');
      return;
    }

    try {
      setResult(null);
      setElapsedSeconds(0);
      setIsRecording(true);
      const recording = await cameraRef.current.recordAsync({ maxDuration: CLIP_SECONDS });
      setIsRecording(false);

      if (!recording?.uri) {
        throw new Error('The camera did not return a video clip.');
      }

      setIsUploading(true);
      const metadata = videoMetadata(recording.uri);
      const formData = new FormData();
      formData.append(
        'video',
        {
          uri: recording.uri,
          name: `road-clip-${Date.now()}.${metadata.extension}`,
          type: metadata.type,
        } as unknown as Blob,
      );

      const response = await fetch(`${API_BASE_URL}/api/v1/potholes/detect`, {
        method: 'POST',
        body: formData,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = typeof payload === 'object' && payload && 'detail' in payload ? payload.detail : null;
        throw new Error(typeof detail === 'string' ? detail : 'The backend could not analyze this clip.');
      }
      if (!payload || typeof payload !== 'object') throw new Error('The backend returned an invalid response.');
      setResult(payload as DetectionResponse);
    } catch (error) {
      setIsRecording(false);
      Alert.alert('Analysis failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  if (!permission) return <View style={styles.loading} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionScreen}>
        <Text style={styles.title}>Camera permission required</Text>
        <Text style={styles.message}>Trackora uses the rear camera to capture a 10-second road clip.</Text>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.buttonText}>Allow camera</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const busy = isRecording || isUploading;
  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        mode="video"
        mute
        videoQuality="720p"
        onCameraReady={() => setCameraReady(true)}
        onMountError={({ message }) => Alert.alert('Camera unavailable', message)}
        onRecordingProgress={(event) => setElapsedSeconds(Math.min(CLIP_SECONDS, Math.floor(event.duration)))}
      />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.header}>
          <Text style={styles.brand}>TRACKORA</Text>
          <Text style={styles.caption}>Pothole scanner</Text>
        </View>

        <View style={styles.footer}>
          {isRecording && <Text style={styles.countdown}>Recording {elapsedSeconds}/{CLIP_SECONDS}s</Text>}
          {isUploading && <Text style={styles.countdown}>Analyzing road surface...</Text>}
          {result && (
            <View style={styles.result}>
              <Text style={styles.resultTitle}>
                {result.potholes_detected ? 'Potholes detected' : 'No potholes detected'}
              </Text>
              <Text style={styles.resultText}>
                {result.potholes_detected} candidate{result.potholes_detected === 1 ? '' : 's'} in {result.frames_analyzed} frames
              </Text>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={!cameraReady || busy}
            onPress={recordAndAnalyze}
            style={[styles.recordButton, (!cameraReady || busy) && styles.disabledButton]}
          >
            {isUploading ? <ActivityIndicator color="#08131c" /> : <Text style={styles.recordText}>{isRecording ? 'Recording...' : 'Start recording'}</Text>}
          </Pressable>
          <Text style={styles.hint}>Captures and uploads one {CLIP_SECONDS}-second clip automatically.</Text>
        </View>
      </SafeAreaView>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#08131c' },
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'space-between' },
  loading: { flex: 1, backgroundColor: '#08131c' },
  permissionScreen: { flex: 1, justifyContent: 'center', padding: 28, backgroundColor: '#08131c' },
  header: { paddingHorizontal: 24, paddingTop: 12 },
  brand: { color: '#ffffff', fontSize: 18, fontWeight: '800', letterSpacing: 2 },
  caption: { color: '#b9c7d0', fontSize: 14, marginTop: 4 },
  title: { color: '#ffffff', fontSize: 28, fontWeight: '800' },
  message: { color: '#b9c7d0', fontSize: 16, lineHeight: 24, marginTop: 10, marginBottom: 24 },
  footer: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 28 },
  countdown: { color: '#ffffff', fontSize: 16, fontWeight: '700', marginBottom: 12, textShadowColor: '#000000', textShadowRadius: 4 },
  recordButton: { alignItems: 'center', backgroundColor: '#47e6a1', borderRadius: 28, minWidth: 230, paddingHorizontal: 28, paddingVertical: 17 },
  disabledButton: { opacity: 0.55 },
  primaryButton: { alignSelf: 'flex-start', backgroundColor: '#47e6a1', borderRadius: 24, paddingHorizontal: 22, paddingVertical: 14 },
  buttonText: { color: '#08131c', fontSize: 16, fontWeight: '800' },
  recordText: { color: '#08131c', fontSize: 16, fontWeight: '800' },
  hint: { color: '#d8e1e7', fontSize: 12, marginTop: 12, textAlign: 'center', textShadowColor: '#000000', textShadowRadius: 3 },
  result: { alignItems: 'center', backgroundColor: 'rgba(8, 19, 28, 0.9)', borderRadius: 16, marginBottom: 16, padding: 14, width: '100%' },
  resultTitle: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  resultText: { color: '#b9c7d0', fontSize: 14, marginTop: 4 },
});
