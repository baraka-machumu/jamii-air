// The enrollment QR code (App Flow §15.2 step 3). Drawn in the browser from the otpauth URL the
// server sends: the secret never goes to a third-party image service.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrCode({ value, size = 180 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => { if (current) setDataUrl(url); })
      .catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [value, size]);

  // The manual key beside it is the fallback, so a failed drawing is not a dead end.
  if (failed) return <p className="text-muted-foreground">Couldn't draw the QR code — use the key below.</p>;

  return (
    <div
      className="flex items-center justify-center rounded-md border bg-white p-2"
      style={{ width: size + 20, height: size + 20 }}
    >
      {dataUrl && <img src={dataUrl} width={size} height={size} alt="QR code for your authenticator app" />}
    </div>
  );
}
