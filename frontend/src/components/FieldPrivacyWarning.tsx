import { useEffect, useState } from "react";
import { fieldPrivacyChecker as defaultChecker } from "../ai/fieldPrivacy";
import type { FieldPrivacyChecker, PrivacyFinding } from "../ai/fieldPrivacy";
import "./FieldPrivacyWarning.css";

const DEBOUNCE_MS = 300;

export function FieldPrivacyWarning({
  label,
  checker = defaultChecker,
}: {
  label: string;
  checker?: FieldPrivacyChecker;
}) {
  const [findings, setFindings] = useState<PrivacyFinding[]>([]);

  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      checker
        .checkFieldPrivacy({ label })
        .then((next) => {
          if (alive) setFindings(next);
        })
        .catch((error: unknown) => {
          if (!alive) return;
          console.error(error);
          setFindings([]);
        });
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [checker, label]);

  if (findings.length === 0) return null;

  return (
    <p className="field-privacy-warning" role="status">
      <span className="field-privacy-warning__label">주의</span>
      {findings.map((finding) => (
        <span key={finding.category}>
          {finding.message} {finding.suggestion}
        </span>
      ))}
    </p>
  );
}
