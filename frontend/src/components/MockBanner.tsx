import { useSyncExternalStore } from "react";
import { hasUnverifiedResponse, subscribeUnverified } from "../api/mockNotice";
import "./MockBanner.css";

export function MockBanner() {
  const unverified = useSyncExternalStore(
    subscribeUnverified,
    hasUnverifiedResponse,
    () => false,
  );
  if (!(import.meta.env.DEV && import.meta.env.VITE_API_MOCK === "1")) {
    return null;
  }
  return (
    <p className="mock-banner" role="status">
      목업 데이터로 보고 있어요
      {unverified ? " 서버 미검증 호출이 있어요" : null}
    </p>
  );
}
