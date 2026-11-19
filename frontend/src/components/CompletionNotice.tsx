import "./CompletionNotice.css";

/**
 * The operator's completion notice as plain text (#406). React escapes it, so tags and links show
 * as typed; line breaks are kept by CSS. Renders nothing when there is no notice.
 */
export function CompletionNotice({ text, title = "안내" }: { text: string | null; title?: string }) {
  if (!text) return null;
  return (
    <section className="completion-notice" aria-label={title}>
      <h3 className="completion-notice__title">{title}</h3>
      <p className="completion-notice__text">{text}</p>
    </section>
  );
}
