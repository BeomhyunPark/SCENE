import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./Button.css";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "danger"
  | "danger-outline";

export type ButtonSize = 48 | 40 | 32;

type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

function LoadingIndicator() {
  return (
    <svg
      className="scene-button__spinner"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 2.4C9.28332 2.40229 10.5269 2.84529 11.5227 3.65485C12.5184 4.46442 13.2059 5.59143 13.4701 6.84727C13.7342 8.1031 13.559 9.41157 12.9738 10.5537C12.3886 11.6958 11.4289 12.6023 10.2552 13.1214C9.08159 13.6405 7.76525 13.7408 6.52653 13.4054C5.2878 13.07 4.20185 12.3194 3.45041 11.279C2.69897 10.2387 2.32763 8.97188 2.39855 7.69052C2.46947 6.40916 2.97834 5.19103 3.84 4.24"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Button({
  variant = "primary",
  size = 40,
  loading = false,
  disabled = false,
  children,
  className,
  type = "button",
  onClick,
  ...rest
}: ButtonProps) {
  const classes = [
    "scene-button",
    `scene-button--${variant}`,
    `scene-button--size-${size}`,
    loading ? "scene-button--loading" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled}
      aria-busy={loading ? true : undefined}
      onClick={(event) => {
        if (loading) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {loading ? <LoadingIndicator /> : null}
      <span className="scene-button__label">{children}</span>
    </button>
  );
}
