/**
 * Rear-camera QR reading for 현장 운영 (#286). The page owns the camera stream (getUserMedia) so it can
 * tell a denied permission from a missing camera, and uses `qr-scanner` only to decode frames: it picks
 * the native BarcodeDetector where it exists and falls back to its own Web Worker decoder, which is
 * what iOS Safari needs. The library loads on first use, so the rest of the app does not carry it.
 */
export type CameraFailure = "insecure" | "unsupported" | "denied" | "no-camera" | "busy" | "failed";

export class CameraError extends Error {
  readonly reason: CameraFailure;
  constructor(reason: CameraFailure) {
    super(reason);
    this.reason = reason;
  }
}

export type QrCamera = { stop: () => void };

const SCAN_INTERVAL_MS = 200;

/**
 * Opens the rear camera on `video` and calls `onCode` for every decoded frame until `stop()`. After
 * `signal` aborts, a start still in flight releases its stream without touching `video`, so a newer
 * start on the same element (React StrictMode, 다시 시도) keeps its own.
 */
export async function startQrCamera(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
  signal?: AbortSignal,
): Promise<QrCamera> {
  if (!window.isSecureContext) throw new CameraError("insecure");
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError("unsupported");

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (error) {
    throw new CameraError(cameraFailure(error));
  }
  if (signal?.aborted) {
    for (const track of stream.getTracks()) track.stop();
    throw new CameraError("failed");
  }

  let stopped = false;
  let timer: number | undefined;
  let engine: Worker | BarcodeDetectorLike | undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(timer);
    for (const track of stream.getTracks()) track.stop();
    if (video.srcObject === stream) video.srcObject = null;
    if (engine && "terminate" in engine) engine.terminate();
  };

  signal?.addEventListener("abort", stop, { once: true });
  try {
    video.setAttribute("playsinline", "");
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    const { default: QrScanner } = await import("qr-scanner");
    engine = (await QrScanner.createQrEngine()) as Worker | BarcodeDetectorLike;
    if (stopped) {
      // Stopped while the decoder loaded: stop() ran before there was an engine to end.
      if ("terminate" in engine) engine.terminate();
      return { stop };
    }
    const canvas = document.createElement("canvas");
    // Every frame is read back for decoding; this keeps Chrome on the faster path.
    canvas.getContext("2d", { willReadFrequently: true });
    const tick = async () => {
      if (stopped) return;
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        try {
          const result = await QrScanner.scanImage(video, {
            qrEngine: engine as Worker,
            canvas,
            returnDetailedScanResult: true,
          });
          if (!stopped && result.data) onCode(result.data);
        } catch {
          // No QR in this frame.
        }
      }
      if (!stopped) timer = window.setTimeout(() => void tick(), SCAN_INTERVAL_MS);
    };
    void tick();
  } catch (error) {
    stop();
    throw error instanceof CameraError ? error : new CameraError("failed");
  }
  return { stop };
}

type BarcodeDetectorLike = { detect: (source: unknown) => Promise<unknown> };

function cameraFailure(error: unknown): CameraFailure {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no-camera";
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  return "failed";
}
