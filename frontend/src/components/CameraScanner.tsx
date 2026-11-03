import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerProps {
  // Called once for each code the camera reads. The scanner stays open for the next pack.
  onScan: (code: string) => void;
  onClose: () => void;
}

const DUPLICATE_WINDOW_MS = 1500;

// Reads barcodes with the device camera, for phones and tablets without a USB scanner. The camera
// needs a secure page (HTTPS) or localhost. The same code is ignored for a moment after it is
// read, so one label held in front of the camera doesn't add twice.
export function CameraScanner({ onScan, onClose }: CameraScannerProps) {
  const [message, setMessage] = useState<string | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!window.isSecureContext) {
      setMessage('The camera needs the app to open over HTTPS (or on this computer as localhost).');
      return;
    }

    const scanner = new Html5Qrcode('camera-scan-region', {
      formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.QR_CODE],
      verbose: false,
    });
    let lastCode = '';
    let lastAt = 0;
    let stopped = false;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 280, height: 160 } },
        (decodedText) => {
          const now = Date.now();
          if (decodedText === lastCode && now - lastAt < DUPLICATE_WINDOW_MS) return;
          lastCode = decodedText;
          lastAt = now;
          onScanRef.current(decodedText.trim());
        },
        () => {
          // A frame with no code in it is normal. Nothing to report.
        },
      )
      .catch((err: unknown) => {
        if (!stopped) setMessage(`Camera could not start: ${err instanceof Error ? err.message : String(err)}`);
      });

    return () => {
      stopped = true;
      // stop() throws straight away, instead of rejecting, when the camera never started. Both
      // cases are handled, so closing the scanner can never crash the page.
      const release = () => {
        try {
          scanner.clear();
        } catch {
          // Nothing to clear if the camera never started.
        }
      };
      try {
        Promise.resolve(scanner.stop()).catch(() => undefined).finally(release);
      } catch {
        release();
      }
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(18,48,31,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div className="card" style={{ width: 'min(440px, 100%)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Scan with camera</div>
        <div id="camera-scan-region" style={{ width: '100%', minHeight: 240 }} />
        {message && <div className="error-banner">{message}</div>}
        <div className="muted" style={{ fontSize: 13 }}>Hold the pack label in the box. Each pack is added once.</div>
        <button type="button" className="btn p" style={{ minHeight: 48 }} onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
