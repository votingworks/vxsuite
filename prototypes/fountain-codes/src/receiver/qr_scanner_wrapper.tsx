import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

export type ScanMode = 'jsqr' | 'zxing' | 'server';

export const SCAN_MODE_LABELS: Record<ScanMode, string> = {
  jsqr: 'jsQR (JS)',
  zxing: 'ZXing (WASM)',
  server: 'Server (zedbar)',
};

export interface ScanStats {
  framesSent: number;
  qrFound: number;
  qrMissed: number;
  errors: number;
  avgRoundTripMs: number;
  lastResult: string;
  resolution: string;
  cropSize: string;
  payloadKb: string;
}

interface QrScannerWrapperProps {
  onScan: (data: Uint8Array) => void;
  onStatsUpdate: (stats: ScanStats) => void;
  active: boolean;
  scanMode: ScanMode;
}

// ─── Lazy-loaded WASM decoders ───────────────────────────────────────────────

type DecodeResult = Uint8Array[] | null;

let zxingReady: Promise<typeof import('zxing-wasm/reader')> | null = null;
function getZxing() {
  if (!zxingReady) {
    zxingReady = import('zxing-wasm/reader');
  }
  return zxingReady;
}

async function decodeWithZxing(imageData: ImageData): Promise<DecodeResult> {
  const zxing = await getZxing();
  const results = await zxing.readBarcodes(imageData, {
    formats: ['QRCode'],
    tryHarder: true,
  });
  if (results.length === 0) return null;
  return results.filter((r) => r.isValid).map((r) => r.bytes);
}

function decodeWithJsQR(
  data: Uint8ClampedArray,
  width: number,
  height: number
): DecodeResult {
  const result = jsQR(data, width, height);
  if (!result) return null;
  return [new Uint8Array(result.binaryData)];
}

// ─── Utility functions ───────────────────────────────────────────────────────

function rgbaToGrayscale(imageData: ImageData): Uint8Array {
  const { data, width, height } = imageData;
  const grayscale = new Uint8Array(width * height);
  for (let rgba = 0, gray = 0; rgba < data.length; rgba += 4, gray += 1) {
    grayscale[gray] = Math.round(
      0.299 * data[rgba] + 0.587 * data[rgba + 1] + 0.114 * data[rgba + 2]
    );
  }
  return grayscale;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getCenterCrop(
  video: HTMLVideoElement
): { sx: number; sy: number; size: number } {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const maxCrop = Math.min(vw, vh, 600);
  return {
    sx: Math.floor((vw - maxCrop) / 2),
    sy: Math.floor((vh - maxCrop) / 2),
    size: maxCrop,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function QrScannerWrapper({
  onScan,
  onStatsUpdate,
  active,
  scanMode,
}: QrScannerWrapperProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const statsRef = useRef<ScanStats>({
    framesSent: 0,
    qrFound: 0,
    qrMissed: 0,
    errors: 0,
    avgRoundTripMs: 0,
    lastResult: 'Waiting for camera...',
    resolution: '',
    cropSize: '',
    payloadKb: '',
  });
  const roundTripTimes = useRef<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const updateStats = useCallback(
    (patch: Partial<ScanStats>) => {
      Object.assign(statsRef.current, patch);
      onStatsUpdate({ ...statsRef.current });
    },
    [onStatsUpdate]
  );

  // Record a timing sample and compute the rolling average
  const recordTiming = useCallback((ms: number) => {
    roundTripTimes.current.push(ms);
    if (roundTripTimes.current.length > 20) roundTripTimes.current.shift();
    return Math.round(
      roundTripTimes.current.reduce((a, b) => a + b, 0) /
        roundTripTimes.current.length
    );
  }, []);

  // Capture a cropped frame from the video
  const captureFrame = useCallback((): {
    imageData: ImageData;
    crop: { sx: number; sy: number; size: number };
  } | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < video.HAVE_CURRENT_DATA) {
      return null;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const crop = getCenterCrop(video);
    canvas.width = crop.size;
    canvas.height = crop.size;

    if (statsRef.current.resolution === '') {
      updateStats({
        resolution: `${video.videoWidth}x${video.videoHeight}`,
        cropSize: `${crop.size}x${crop.size}`,
      });
    }

    ctx.drawImage(
      video,
      crop.sx, crop.sy, crop.size, crop.size,
      0, 0, crop.size, crop.size
    );
    return {
      imageData: ctx.getImageData(0, 0, crop.size, crop.size),
      crop,
    };
  }, [updateStats]);

  // ─── Browser decode loop (jsQR / ZXing / ZBar) ──────────────────────────

  const processFrameLocal = useCallback(async () => {
    if (!active) return;
    if (busyRef.current) {
      animFrameRef.current = requestAnimationFrame(processFrameLocal);
      return;
    }

    const frame = captureFrame();
    if (!frame) {
      animFrameRef.current = requestAnimationFrame(processFrameLocal);
      return;
    }

    if (statsRef.current.payloadKb === '') {
      updateStats({ payloadKb: 'n/a (local)' });
    }

    busyRef.current = true;
    const startTime = performance.now();
    let decoded: DecodeResult = null;

    try {
      if (scanMode === 'jsqr') {
        decoded = decodeWithJsQR(
          frame.imageData.data,
          frame.crop.size,
          frame.crop.size
        );
      } else if (scanMode === 'zxing') {
        decoded = await decodeWithZxing(frame.imageData);
      }
    } catch (err) {
      updateStats({
        framesSent: statsRef.current.framesSent + 1,
        errors: statsRef.current.errors + 1,
        lastResult: `Decode error: ${err}`,
      });
      busyRef.current = false;
      if (active) {
        animFrameRef.current = requestAnimationFrame(processFrameLocal);
      }
      return;
    }

    const elapsed = performance.now() - startTime;
    const avgRt = recordTiming(elapsed);
    const newFramesSent = statsRef.current.framesSent + 1;

    if (decoded && decoded.length > 0) {
      updateStats({
        framesSent: newFramesSent,
        qrFound: statsRef.current.qrFound + 1,
        avgRoundTripMs: avgRt,
        lastResult: `QR found (${Math.round(elapsed)}ms)`,
      });
      for (const bytes of decoded) {
        onScan(bytes);
      }
    } else {
      updateStats({
        framesSent: newFramesSent,
        qrMissed: statsRef.current.qrMissed + 1,
        avgRoundTripMs: avgRt,
        lastResult: `No QR found (${Math.round(elapsed)}ms)`,
      });
    }

    busyRef.current = false;
    if (active) {
      animFrameRef.current = requestAnimationFrame(processFrameLocal);
    }
  }, [active, scanMode, onScan, updateStats, captureFrame, recordTiming]);

  // ─── Server decode loop (zedbar via POST) ────────────────────────────────

  const processFrameServer = useCallback(async () => {
    if (!active) return;
    if (busyRef.current) {
      animFrameRef.current = requestAnimationFrame(processFrameServer);
      return;
    }

    const frame = captureFrame();
    if (!frame) {
      animFrameRef.current = requestAnimationFrame(processFrameServer);
      return;
    }

    const grayscale = rgbaToGrayscale(frame.imageData);
    const b64Data = uint8ArrayToBase64(grayscale);

    busyRef.current = true;
    const startTime = performance.now();

    try {
      const body = JSON.stringify({
        width: frame.crop.size,
        height: frame.crop.size,
        data: b64Data,
      });

      if (statsRef.current.payloadKb === '') {
        updateStats({ payloadKb: (body.length / 1024).toFixed(0) });
      }

      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      const roundTrip = performance.now() - startTime;
      const avgRt = recordTiming(roundTrip);

      if (response.ok) {
        const { results } = await response.json();
        const newFramesSent = statsRef.current.framesSent + 1;

        if (results && results.length > 0) {
          updateStats({
            framesSent: newFramesSent,
            qrFound: statsRef.current.qrFound + 1,
            avgRoundTripMs: avgRt,
            lastResult: `QR found (${Math.round(roundTrip)}ms)`,
          });
          for (const base64Res of results) {
            onScan(base64ToUint8Array(base64Res));
          }
        } else {
          updateStats({
            framesSent: newFramesSent,
            qrMissed: statsRef.current.qrMissed + 1,
            avgRoundTripMs: avgRt,
            lastResult: `No QR found (${Math.round(roundTrip)}ms)`,
          });
        }
      } else {
        updateStats({
          framesSent: statsRef.current.framesSent + 1,
          errors: statsRef.current.errors + 1,
          lastResult: `Server error: ${response.status}`,
        });
      }
    } catch (err) {
      updateStats({
        framesSent: statsRef.current.framesSent + 1,
        errors: statsRef.current.errors + 1,
        lastResult: `Network error: ${err}`,
      });
    } finally {
      busyRef.current = false;
    }

    if (active) {
      animFrameRef.current = requestAnimationFrame(processFrameServer);
    }
  }, [active, onScan, updateStats, captureFrame, recordTiming]);

  const processFrame =
    scanMode === 'server' ? processFrameServer : processFrameLocal;

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    async function startCamera() {
      try {
        updateStats({ lastResult: 'Requesting camera access...' });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        updateStats({ lastResult: 'Camera active, scanning...' });
        animFrameRef.current = requestAnimationFrame(processFrame);
      } catch (err) {
        setError(`Camera error: ${err}`);
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [active, processFrame, updateStats]);

  if (error) {
    return <div style={{ color: 'red', padding: 16 }}>{error}</div>;
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <video
        ref={videoRef}
        style={{
          width: 280,
          height: 280,
          background: '#000',
          borderRadius: 8,
          objectFit: 'cover',
        }}
        playsInline
        muted
      />
      {/* Center guide box overlay */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 210,
          height: 210,
          border: '2px solid rgba(0, 200, 0, 0.6)',
          borderRadius: 8,
          pointerEvents: 'none',
        }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
