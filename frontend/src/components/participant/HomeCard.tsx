import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * One home card (participant-home-contract §1). `failed` is set when a reload failed while an earlier
 * value is still shown: the card keeps that value and says "갱신 실패" in small type (§5). Each card
 * sits in its own boundary, so a card that breaks while drawing leaves the others alone.
 */
export function HomeCard({
  title,
  failed = false,
  action,
  children,
  className,
}: {
  title: string;
  failed?: boolean;
  /** A link or button at the top right, such as "전체 보기". */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = `home-card-${title.replace(/\s+/g, "-")}`;
  return (
    <CardBoundary title={title}>
      <section className={`participant-card${className ? ` ${className}` : ""}`} aria-labelledby={id}>
        <div className="participant-card__head">
          <h2 id={id} className="participant-card__title">
            {title}
          </h2>
          {failed ? (
            <span className="participant-card__failed" role="status">
              갱신 실패
            </span>
          ) : null}
          {action ? <div className="participant-card__action">{action}</div> : null}
        </div>
        {children}
      </section>
    </CardBoundary>
  );
}

/** The empty state of a card or tab whose area is on but has nothing published yet. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="participant-card__empty">{children}</p>;
}

class CardBoundary extends Component<{ title: string; children: ReactNode }, { broken: boolean }> {
  state = { broken: false };

  static getDerivedStateFromError(): { broken: boolean } {
    return { broken: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("participant card", this.props.title, error, info.componentStack);
  }

  render() {
    if (!this.state.broken) return this.props.children;
    return (
      <section className="participant-card" aria-label={this.props.title}>
        <div className="participant-card__head">
          <h2 className="participant-card__title">{this.props.title}</h2>
          <span className="participant-card__failed">갱신 실패</span>
        </div>
        <EmptyNote>이 카드를 보여 주지 못했어요. 화면을 새로 고쳐 주세요.</EmptyNote>
      </section>
    );
  }
}
