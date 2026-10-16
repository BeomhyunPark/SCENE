import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "react-router";
import { isApiError } from "../api/errors";
import { acceptInvitation, previewInvitation, type InvitationPreview } from "../api/invitations";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { getMe, logout } from "../api/session";
import {
  captureInvitationToken,
  clearInvitationToken,
  type InvitationCapture,
} from "../invitationToken";
import symbol from "../assets/scene-symbol-header.svg";
import { Button } from "./Button";
import "./InvitationAccept.css";
import "./PublicHeader.css";

const LOGIN_NEXT = "/login?next=/operator/invitations";

type ErrorKind =
  | "login"
  | "mismatch"
  | "unverified"
  | "expired"
  | "revoked"
  | "superseded"
  | "unusable"
  | "retry";

const TERMINAL_KINDS = new Set<ErrorKind>(["expired", "revoked", "superseded", "unusable"]);

export function InvitationAccept() {
  const [capture] = useState<InvitationCapture>(() => captureInvitationToken());
  if (capture.status === "absent") return <Navigate to="/" replace />;
  if (capture.status === "unusable") return <UnusableLink />;
  return <InvitationSession token={capture.token} />;
}

function InvitationSession({ token }: { token: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState(0);
  const [accepted, setAccepted] = useState<string | null>(null);
  const [acceptFailure, setAcceptFailure] = useState<unknown>(null);
  const [switching, setSwitching] = useState(false);

  const me = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  const preview = useQuery({
    queryKey: ["operator", "invitation-preview", attempt],
    queryFn: ({ signal }) => previewInvitation(token, signal),
    enabled: me.isSuccess && accepted == null && acceptFailure == null,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const accept = useMutation({
    mutationFn: () => acceptInvitation(token),
    onSuccess: (result) => {
      setAcceptFailure(null);
      setAccepted(result.outcome);
    },
    onError: (error) => setAcceptFailure(error),
  });

  const previewKind = preview.isError ? errorKind(preview.error) : null;
  const acceptKind = acceptFailure == null ? null : errorKind(acceptFailure);
  const alreadyAccepted = !accepted && preview.data?.outcome === "ALREADY_ACCEPTED";
  const shouldClear =
    accepted === "ACCEPTED" ||
    accepted === "ALREADY_ACCEPTED" ||
    alreadyAccepted ||
    (previewKind != null && TERMINAL_KINDS.has(previewKind)) ||
    (acceptKind != null && TERMINAL_KINDS.has(acceptKind));
  const shouldLogin = previewKind === "login" || acceptKind === "login";

  useEffect(() => {
    if (shouldClear) clearInvitationToken();
  }, [shouldClear]);

  useEffect(() => {
    if (shouldLogin) navigate(LOGIN_NEXT, { replace: true });
  }, [shouldLogin, navigate]);

  if (me.isPending || shouldLogin || (me.isSuccess && preview.isPending) || accept.isPending) {
    return <InvitationFrame busy title="불러오는 중이에요." />;
  }
  if (isApiError(me.error) && me.error.status === 401) {
    return (
      <InvitationFrame
        title="초대를 확인하려면 로그인해 주세요"
        body="로그인하면 초대 내용을 보여 드려요."
        actions={
          <Button type="button" variant="primary" size={40} onClick={() => navigate(LOGIN_NEXT)}>
            로그인
          </Button>
        }
      />
    );
  }
  if (me.isError) {
    return (
      <InvitationFrame
        title="불러오지 못했어요."
        actions={
          <Button type="button" variant="secondary" size={40} onClick={() => void reloadQuery(me)}>
            다시 시도
          </Button>
        }
      />
    );
  }

  if (accepted === "ACCEPTED") return <Accepted />;
  if (accepted === "ALREADY_ACCEPTED" || alreadyAccepted) return <AlreadyAccepted />;
  if (accepted != null) {
    return (
      <InvitationFrame
        title="초대를 확인하지 못했어요"
        body="잠시 후 다시 시도해 주세요."
        actions={
          <Button
            type="button"
            variant="primary"
            size={40}
            onClick={() => {
              setAccepted(null);
              setAttempt((current) => current + 1);
            }}
          >
            다시 시도
          </Button>
        }
      />
    );
  }

  const failure = acceptKind ?? previewKind;
  if (failure === "mismatch") {
    return (
      <InvitationFrame
        title="초대한 이메일과 달라요"
        body="초대를 받은 계정으로 로그인해 주세요."
        actions={
          <>
            <Button type="button" variant="secondary" size={40} onClick={() => leaveHome(navigate)}>
              돌아가기
            </Button>
            <Button
              type="button"
              variant="primary"
              size={40}
              loading={switching}
              onClick={() =>
                void switchAccount(queryClient, navigate, () => setSwitching(true), () => setSwitching(false))
              }
            >
              계정 바꾸기
            </Button>
          </>
        }
      />
    );
  }
  if (failure === "unverified") {
    return (
      <InvitationFrame
        title="이메일 인증이 필요해요"
        body="인증한 뒤 이 초대로 다시 돌아와 주세요."
        actions={
          <Button type="button" variant="primary" size={40} onClick={() => navigate("/verify-email")}>
            이메일 인증
          </Button>
        }
      />
    );
  }
  if (failure === "expired") {
    return (
      <InvitationFrame
        title="초대가 만료됐어요"
        body="새 초대가 필요해요."
        actions={
          <Button type="button" variant="secondary" size={40} onClick={() => leaveHome(navigate)}>
            돌아가기
          </Button>
        }
      />
    );
  }
  if (failure === "revoked") {
    return (
      <InvitationFrame
        title="초대가 취소됐어요"
        body="운영자가 이 초대를 거뒀어요."
        actions={
          <Button type="button" variant="secondary" size={40} onClick={() => leaveHome(navigate)}>
            돌아가기
          </Button>
        }
      />
    );
  }
  if (failure === "superseded") {
    return (
      <InvitationFrame
        title="새 초대로 바뀌었어요"
        body="이전에 받은 링크는 쓸 수 없어요. 새로 받은 초대를 열어 주세요."
        actions={
          <Button type="button" variant="secondary" size={40} onClick={() => leaveHome(navigate)}>
            돌아가기
          </Button>
        }
      />
    );
  }
  if (failure === "unusable") return <UnusableLink />;
  if (failure === "retry" || (preview.isSuccess && preview.data.outcome !== "PENDING")) {
    return (
      <InvitationFrame
        title="초대를 확인하지 못했어요"
        body="잠시 후 다시 시도해 주세요."
        actions={
          <Button
            type="button"
            variant="primary"
            size={40}
            onClick={() => {
              if (acceptFailure != null) {
                setAcceptFailure(null);
                accept.mutate();
                return;
              }
              setAttempt((current) => current + 1);
            }}
          >
            다시 시도
          </Button>
        }
      />
    );
  }

  if (preview.data?.outcome === "PENDING") {
    return <PendingInvite preview={preview.data} loading={accept.isPending} onAccept={() => accept.mutate()} />;
  }
  return <InvitationFrame busy title="불러오는 중이에요." />;
}

function PendingInvite({
  preview,
  loading,
  onAccept,
}: {
  preview: InvitationPreview;
  loading: boolean;
  onAccept: () => void;
}) {
  const eventName = typeof preview.eventName === "string" ? preview.eventName : "";
  const inviterName = typeof preview.inviterName === "string" ? preview.inviterName : "";
  const role = typeof preview.role === "string" ? roleLabel(preview.role) : "";
  return (
    <InvitationFrame
      title={`${eventName} 초대를 받았어요`}
      body={`${inviterName}님이 ${role}로 초대했어요.`}
      actions={
        <Button type="button" variant="primary" size={40} loading={loading} onClick={onAccept}>
          초대 수락
        </Button>
      }
    />
  );
}

function Accepted() {
  const navigate = useNavigate();
  return (
    <InvitationFrame
      title="초대를 수락했어요"
      body="이제 이 행사를 운영할 수 있어요."
      actions={
        <Button type="button" variant="primary" size={40} onClick={() => navigate("/events")}>
          행사 목록
        </Button>
      }
    />
  );
}

function AlreadyAccepted() {
  const navigate = useNavigate();
  return (
    <InvitationFrame
      title="이미 수락한 초대예요"
      body="행사 목록에서 이어서 볼 수 있어요."
      actions={
        <Button type="button" variant="primary" size={40} onClick={() => navigate("/events")}>
          행사 목록
        </Button>
      }
    />
  );
}

function UnusableLink() {
  const navigate = useNavigate();
  return (
    <InvitationFrame
      title="사용할 수 없는 링크예요"
      body="초대 링크를 다시 확인해 주세요."
      actions={
        <Button type="button" variant="secondary" size={40} onClick={() => leaveHome(navigate)}>
          돌아가기
        </Button>
      }
    />
  );
}

function InvitationFrame({
  title,
  body,
  actions,
  busy = false,
}: {
  title: string;
  body?: string;
  actions?: ReactNode;
  busy?: boolean;
}) {
  return (
    <div className="invitation-accept">
      <header className="invitation-accept__header">
        <Link className="invitation-accept__brand public-header__brand" to="/">
          <img src={symbol} alt="" width={36} height={36} aria-hidden="true" />
          <span className="scene-wordmark">SCENE</span>
        </Link>
      </header>
      <main className="invitation-accept__main">
        <section className="invitation-accept__panel">
          <h1 className="invitation-accept__title" aria-live="polite" aria-busy={busy || undefined}>
            {title}
          </h1>
          {body ? <p className="invitation-accept__body">{body}</p> : null}
          {actions ? <div className="invitation-accept__actions">{actions}</div> : null}
        </section>
      </main>
    </div>
  );
}

function leaveHome(navigate: ReturnType<typeof useNavigate>) {
  clearInvitationToken();
  navigate("/");
}

async function switchAccount(
  queryClient: ReturnType<typeof useQueryClient>,
  navigate: ReturnType<typeof useNavigate>,
  start: () => void,
  stop: () => void,
) {
  start();
  try {
    await logout();
    queryClient.removeQueries({ queryKey: queryKeys.me });
    navigate(LOGIN_NEXT);
  } catch {
    stop();
  }
}

function errorKind(error: unknown): ErrorKind {
  if (isApiError(error) && error.status === 401) return "login";
  if (!isApiError(error)) return "retry";
  switch (error.code) {
    case "INVITATION_EMAIL_MISMATCH":
      return "mismatch";
    case "EMAIL_NOT_VERIFIED":
      return "unverified";
    case "INVITATION_EXPIRED":
      return "expired";
    case "INVITATION_REVOKED":
      return "revoked";
    case "INVITATION_SUPERSEDED":
      return "superseded";
    case "INVITATION_NOT_FOUND":
    case "INVITATION_ALREADY_ACCEPTED":
      return "unusable";
    default:
      return "retry";
  }
}

function roleLabel(role: string): string {
  if (role === "OWNER") return "Owner";
  if (role === "MANAGER") return "Manager";
  if (role === "STAFF") return "Staff";
  return role;
}
