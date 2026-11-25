import { useEffect, useState } from "react";

/** Figma TL01 (620:7): the two-pane 현장 운영 from this width up. Matches the shell's desktop breakpoint. */
const WIDE_QUERY = "(min-width: 1024px)";

/** Whether 현장 운영 shows the queue and the detail side by side (#468). jsdom has no matchMedia: false. */
export function useWideField(): boolean {
  const [wide, setWide] = useState(() =>
    typeof window.matchMedia === "function" ? window.matchMedia(WIDE_QUERY).matches : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(list.matches);
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);
  return wide;
}
