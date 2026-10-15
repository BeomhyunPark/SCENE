import { useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import pattern from "../assets/p01-04-hex-pattern.png";
import { PublicHeader } from "./PublicHeader";
import { Button } from "./Button";
import "./PublicJoinPending.css";

const sampleOrganization = "드림공동체";

function shownOrganization(state: unknown) {
  if (typeof state === "object" && state !== null && "organizationName" in state) {
    const name = state.organizationName;
    if (typeof name === "string" && name.trim() !== "") {
      return name.trim();
    }
  }
  return sampleOrganization;
}

type RequestState = "pending" | "cancelled";
type View = "waiting" | "checked" | "cancel";

export function PublicJoinPending() {
  const location = useLocation();
  const navigate = useNavigate();
  const organizationName = shownOrganization(location.state);
  const [requestState, setRequestState] = useState<RequestState>("pending");
  const [view, setView] = useState<View>("waiting");

  function findAgain() {
    navigate("/find-organization");
  }

  if (requestState === "cancelled") {
    return (
      <PendingScreen
        organizationName={organizationName}
        title="가입 요청을 취소했어요"
        copy={`${organizationName} 가입 요청이 철회됐어요.\n다시 가입하려면 새 요청을 보내 주세요.`}
        footerEnd
        footer={
          <>
            <Button type="button" variant="secondary" size={40} onClick={findAgain}>
              소속 다시 찾기
            </Button>
            <Button type="button" variant="primary" size={40} onClick={findAgain}>
              가입 안내
            </Button>
          </>
        }
      />
    );
  }

  if (view === "checked") {
    return (
      <PendingScreen
        organizationName={organizationName}
        title="아직 승인 대기 중이에요"
        copy={`${organizationName}의 가입 승인을 기다리고 있어요.`}
        footerEnd
        footer={
          <Button type="button" variant="primary" size={40} onClick={() => setView("waiting")}>
            대기 화면으로
          </Button>
        }
      />
    );
  }

  if (view === "cancel") {
    return (
      <PendingScreen
        organizationName={organizationName}
        title="가입 요청을 취소할까요?"
        copy={`${organizationName}의 대기 요청만 철회해요.\n다른 조직 소속과 기존 작업은 유지돼요.`}
        footerEnd
        footer={
          <>
            <Button type="button" variant="secondary" size={40} onClick={() => setView("waiting")}>
              계속 대기
            </Button>
            <Button
              type="button"
              variant="primary"
              size={40}
              onClick={() => setRequestState("cancelled")}
            >
              요청 취소
            </Button>
          </>
        }
      />
    );
  }

  return (
    <PendingScreen
      organizationName={organizationName}
      title="가입 승인을 기다리고 있어요"
      copy={`${organizationName}에 가입 요청을 보냈어요.\n승인 전에는 조직 운영 화면에 접근할 수 없어요.`}
      footer={
        <>
          <Button type="button" variant="tertiary" size={40} onClick={() => setView("cancel")}>
            요청 취소
          </Button>
          <span className="public-pending__actions">
            <Button type="button" variant="secondary" size={40} onClick={findAgain}>
              소속 다시 찾기
            </Button>
            <Button type="button" variant="primary" size={40} onClick={() => setView("checked")}>
              상태 다시 확인
            </Button>
          </span>
        </>
      }
    />
  );
}

function PendingScreen({
  organizationName,
  title,
  copy,
  footer,
  footerEnd = false,
}: {
  organizationName: string;
  title: string;
  copy: string;
  footer: ReactNode;
  footerEnd?: boolean;
}) {
  return (
    <>
      <PublicHeader accountActions primaryStart />
      <main className="public-pending">
        <div className="public-pending__pattern" aria-hidden="true">
          <img className="public-pending__hex public-pending__hex--1" src={pattern} alt="" />
          <img className="public-pending__hex public-pending__hex--2" src={pattern} alt="" />
          <img className="public-pending__hex public-pending__hex--3" src={pattern} alt="" />
          <img className="public-pending__hex public-pending__hex--4" src={pattern} alt="" />
        </div>
        <section className="public-pending__card">
          <p className="public-pending__eyebrow">{organizationName}</p>
          <div className="public-pending__banner">
            <h1 className="public-pending__title">{title}</h1>
            <p className="public-pending__copy">{copy}</p>
          </div>
          <div className={`public-pending__footer${footerEnd ? " public-pending__footer--end" : ""}`}>
            {footer}
          </div>
        </section>
      </main>
    </>
  );
}
