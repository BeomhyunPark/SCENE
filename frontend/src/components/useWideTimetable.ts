import { useEffect, useState } from "react";

/** True on screens wide enough for every day side by side (the operator desktop). jsdom has no matchMedia: false. */
export function useWideTimetable(query = "(min-width: 1024px)"): boolean {
  const [wide, setWide] = useState(() => typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const update = () => setWide(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return wide;
}
