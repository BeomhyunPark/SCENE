import { useRef, type ReactNode } from "react";
import { useModalFocus } from "./useModalFocus";
import "./ConfirmDialog.css";

export function ConfirmDialog({
  title,
  children,
  footer,
  onClose,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(dialogRef, onClose);
  return (
    <div className="confirm-dialog">
      <div
        ref={dialogRef}
        className="confirm-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        tabIndex={-1}
      >
        <h2 id="confirm-dialog-title" className="confirm-dialog__title">
          {title}
        </h2>
        <div className="confirm-dialog__body">{children}</div>
        <div className="confirm-dialog__footer">{footer}</div>
      </div>
    </div>
  );
}
