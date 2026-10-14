import { useEffect, useRef } from "react";
import { Button } from "./Button";
import "./PublicTermsDialog.css";

const terms = [
  {
    title: "이용약관",
    detail: "서비스 이용과 계정 관리, 이용 제한, 탈퇴 및 책임 범위를 확인했어요.",
  },
  {
    title: "개인정보 수집·이용",
    detail: "수집 항목, 이용 목적, 보유 기간과 동의 거부 시 영향을 확인했어요.",
  },
];

type PublicTermsDialogProps = {
  onClose: () => void;
};

function focusableIn(dialog: HTMLElement) {
  return [...dialog.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea")].filter(
    (element) => !element.hidden && element.tabIndex !== -1 && !element.hasAttribute("disabled"),
  );
}

export function PublicTermsDialog({ onClose }: PublicTermsDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) {
        return;
      }
      const items = focusableIn(dialog);
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const atEdge = active === dialog || !dialog.contains(active);
      if (event.shiftKey) {
        if (atEdge || active === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (atEdge || active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div
      className="public-terms"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="public-terms__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="public-terms__header">
          <h2 className="public-terms__title" id="terms-title">
            약관 확인
          </h2>
          <button className="public-terms__dismiss" type="button" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="public-terms__rule" />
        <div className="public-terms__blocks">
          {terms.map((term) => (
            <section className="public-terms__block" key={term.title}>
              <h3 className="public-terms__term">{term.title}</h3>
              <p className="public-terms__detail">{term.detail}</p>
            </section>
          ))}
        </div>
        <div className="public-terms__footer">
          <Button
            type="button"
            variant="secondary"
            size={40}
            className="public-terms__close"
            onClick={onClose}
          >
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}
