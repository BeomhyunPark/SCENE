import { encode } from "uqr";

/** Quiet zone in modules. The QR spec asks for 4; scanners in bright light need it. */
const QUIET = 4;

/** One SVG path for the dark modules, with the quiet zone included in `size`. */
export function qrPath(value: string): { size: number; d: string } {
  const qr = encode(value, { ecc: "M", border: 0 });
  const parts: string[] = [];
  qr.data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x + QUIET} ${y + QUIET}h1v1h-1z`);
    });
  });
  return { size: qr.size + QUIET * 2, d: parts.join("") };
}
