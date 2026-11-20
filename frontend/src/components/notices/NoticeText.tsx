import { Fragment } from "react";
import { splitLinks } from "./noticeLinks";

/** Plain text with line breaks kept; only http(s) addresses become links (see noticeLinks). */
export function NoticeText({ text, className }: { text: string; className?: string }) {
  return (
    <p className={className ?? "notice-text"}>
      {splitLinks(text).map((part, index) =>
        part.kind === "link" ? (
          <a key={index} href={part.value} target="_blank" rel="noopener noreferrer">
            {part.value}
          </a>
        ) : (
          <Fragment key={index}>{part.value}</Fragment>
        ),
      )}
    </p>
  );
}
