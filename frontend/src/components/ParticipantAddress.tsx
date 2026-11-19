import { useState } from "react";
import { Button } from "./Button";
import { qrPath } from "./qrPath";

/**
 * The event's one participant address (DEC-078 §8). Operators copy it, or its QR, into a group
 * chat. Participants come back here with name, phone and their six-digit number. The address has
 * no key in it.
 */
export function ParticipantAddress({ eventId }: { eventId: string }) {
  const address = `${window.location.origin}/participate/${eventId}`;
  const [copied, setCopied] = useState<string | null>(null);
  const { size, d } = qrPath(address);

  async function copyQr() {
    try {
      const png = await qrPng(size, d);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setCopied("QR 그림을 복사했어요.");
    } catch {
      const png = await qrPng(size, d).catch(() => null);
      if (!png) {
        setCopied("QR을 복사하지 못했어요.");
        return;
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(png);
      link.download = "scene-participant-qr.png";
      link.click();
      URL.revokeObjectURL(link.href);
      setCopied("이 브라우저는 그림 복사를 막아서 QR을 파일로 받았어요.");
    }
  }

  return (
    <section className="event-home__apply" aria-labelledby="participant-address-title">
      <h2 id="participant-address-title">참가자 주소</h2>
      <p>신청한 사람이 이 주소에서 이름, 전화번호, 직접 정한 숫자 6자리로 들어와요. 단체 대화방에 그대로 올려도 돼요.</p>
      <input className="event-home__address" readOnly aria-label="참가자 주소" value={address} />
      <svg
        className="event-home__qr"
        role="img"
        aria-label="참가자 주소 QR"
        viewBox={`0 0 ${size} ${size}`}
        width={160}
        height={160}
        shapeRendering="crispEdges"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width={size} height={size} fill="#ffffff" />
        <path d={d} fill="#000000" />
      </svg>
      {copied ? <p role="status">{copied}</p> : null}
      <div className="event-home__address-actions">
        <Button
          type="button"
          variant="secondary"
          size={40}
          onClick={() => {
            void navigator.clipboard.writeText(address).then(
              () => setCopied("주소를 복사했어요."),
              () => setCopied("주소를 복사하지 못했어요."),
            );
          }}
        >
          주소 복사
        </Button>
        <Button type="button" variant="secondary" size={40} onClick={() => void copyQr()}>
          QR 복사
        </Button>
      </div>
    </section>
  );
}

/** Draws the QR path on a canvas, 8 px per module, and returns a PNG. */
function qrPng(size: number, d: string): Promise<Blob> {
  const scale = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size * scale;
  canvas.height = size * scale;
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("no canvas"));
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scale, scale);
  context.fillStyle = "#000000";
  context.fill(new Path2D(d));
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no png"))), "image/png");
  });
}
