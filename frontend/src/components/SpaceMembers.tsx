import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isApiError } from "../api/errors";
import type { IssuedInvitation, PendingInvitation } from "../api/invitations";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import {
  createSpaceInvitation,
  listSpaceInvitations,
  listSpaceMembers,
  resendSpaceInvitation,
  revokeSpaceInvitation,
} from "../api/spaceInvitations";
import type { ItemPage } from "../api/types";
import { Button } from "./Button";
import { formatSubmittedAt, spaceRoleLabel } from "./eventFormat";
import { SpacePage } from "./SpacePage";
import "./EventHome.css";

/**
 * Organization 멤버 page (#376): the member list (#362) and, for OWNER and ADMIN, invitations. It is
 * an organization menu, so it never opens an event and Back stays outside events.
 */
export function SpaceMembers() {
  return (
    <SpacePage title="멤버">
      {({ spaceId, spaceName, role }) => (
        <>
          <Members spaceId={spaceId} />
          {/* OWNER and ADMIN invite (DEC-076). The server checks again and answers 403 FORBIDDEN otherwise. */}
          {role === "OWNER" || role === "ADMIN" ? <SpaceInvitations spaceId={spaceId} spaceName={spaceName} /> : null}
        </>
      )}
    </SpacePage>
  );
}

function Members({ spaceId }: { spaceId: string }) {
  const members = useQuery({
    queryKey: queryKeys.spaceMembers(spaceId),
    queryFn: ({ signal }) => listSpaceMembers(spaceId, signal),
  });
  return (
    <section className="space-settings__card event-home__applicants" aria-labelledby="members-title">
      <div className="event-home__applicants-head">
        <h2 id="members-title" className="space-settings__title">
          멤버
        </h2>
        {members.data ? <span className="event-home__count">{members.data.page.totalItems}명</span> : null}
      </div>
      {members.isPending ? <p>불러오는 중이에요.</p> : null}
      {members.isError ? (
        <>
          <p>멤버를 불러오지 못했어요.</p>
          <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(members)}>
            다시 시도
          </Button>
        </>
      ) : null}
      {members.data ? (
        <ul className="event-home__applicant-rows" aria-labelledby="members-title">
          {members.data.items.map((item) => (
            <li key={item.userId} className="event-home__member">
              <span className="event-home__applicant-name">{item.displayName}</span>
              {item.email ? <span className="event-home__applicant-time">{item.email}</span> : null}
              <span className="event-home__count">{spaceRoleLabel(item.role)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Space invitations for OWNER and ADMIN. The January screen has no role picker, so every
 * invitation is MEMBER (DEC-076). The link comes back once from create or resend and lives only in
 * this component's state, never in localStorage, sessionStorage, the path, or the query.
 */
function SpaceInvitations({ spaceId, spaceName }: { spaceId: string; spaceName: string }) {
  const queryClient = useQueryClient();
  const invitations = useQuery({
    queryKey: queryKeys.spaceInvitations(spaceId),
    queryFn: ({ signal }) => listSpaceInvitations(spaceId, signal),
  });
  const [email, setEmail] = useState("");
  const [issued, setIssued] = useState<(IssuedInvitation & { email: string }) | null>(null);
  const [copied, setCopied] = useState(false);
  const [alert, setAlert] = useState("");
  const [fieldError, setFieldError] = useState("");

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.spaceInvitations(spaceId) });
  }

  function show(result: IssuedInvitation, to: string) {
    setIssued({ ...result, email: to });
    setCopied(false);
    setAlert("");
    refresh();
  }

  function fail(caught: unknown) {
    if (isApiError(caught, "VALIDATION_FAILED")) {
      const field = caught.errors?.[0]?.field;
      if (field === "email") {
        setFieldError("이메일을 확인해 주세요.");
        return;
      }
      setAlert("이미 처리된 초대예요.");
      refresh();
      return;
    }
    if (isApiError(caught, "FORBIDDEN") || isApiError(caught, "NOT_A_MEMBER")) setAlert("초대할 권한이 없어요.");
    else if (isApiError(caught, "RESOURCE_NOT_FOUND")) {
      setAlert("초대를 찾을 수 없어요.");
      refresh();
    } else setAlert("처리하지 못했어요. 다시 시도해 주세요.");
  }

  const create = useMutation({
    mutationFn: (input: { email: string }) => createSpaceInvitation(spaceId, input),
    onSuccess: (result, input) => {
      show(result, input.email.trim().toLowerCase());
      setEmail("");
    },
    onError: fail,
  });
  const resend = useMutation({
    mutationFn: (target: { id: string; email: string }) => resendSpaceInvitation(spaceId, target.id),
    onSuccess: (result, target) => {
      // The old row is SUPERSEDED now. Swap it before the refetch so a quick click cannot hit it.
      queryClient.setQueryData<ItemPage<PendingInvitation>>(queryKeys.spaceInvitations(spaceId), (current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === target.id ? { ...item, id: result.id, expiresAt: result.expiresAt } : item,
              ),
            }
          : current,
      );
      show(result, target.email);
    },
    onError: fail,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeSpaceInvitation(spaceId, id),
    onSuccess: (_, id) => {
      if (issued?.id === id) setIssued(null);
      setAlert("");
      refresh();
    },
    onError: fail,
  });
  const pending = create.isPending || resend.isPending || revoke.isPending;

  function submit(form: FormEvent<HTMLFormElement>) {
    form.preventDefault();
    setFieldError("");
    if (email.trim().length === 0) {
      setFieldError("이메일을 적어 주세요.");
      return;
    }
    create.mutate({ email: email.trim() });
  }

  const address = issued ? `${window.location.origin}${issued.link}` : "";

  return (
    <section className="space-settings__card event-home__apply" aria-labelledby="space-invite-title">
      <h2 id="space-invite-title" className="space-settings__title">
        멤버 초대하기
      </h2>
      <p>
        초대 링크를 만들어 직접 보내 주세요. 받은 사람은 {spaceName}의 멤버가 돼요. 링크는 지금 한 번만 보여요.
      </p>
      <form className="event-home__invite" onSubmit={submit} noValidate>
        <label htmlFor="space-invite-email">이메일</label>
        <input
          id="space-invite-email"
          className="event-home__address"
          type="email"
          autoComplete="off"
          value={email}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? "space-invite-email-error" : undefined}
          onChange={(change) => setEmail(change.target.value)}
        />
        {fieldError ? (
          <p id="space-invite-email-error" className="event-home__error">
            {fieldError}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size={40} loading={create.isPending} disabled={pending}>
          초대 링크 만들기
        </Button>
      </form>
      {alert ? (
        <p className="event-home__error" role="alert">
          {alert}
        </p>
      ) : null}
      {issued ? (
        <div className="event-home__issued" role="status">
          <p>{issued.email}에게 보낼 링크예요. 이 화면을 떠나면 다시 볼 수 없어요.</p>
          <input className="event-home__address" readOnly aria-label="초대 링크" value={address} />
          {copied ? <p>복사했어요.</p> : null}
          <Button
            type="button"
            variant="secondary"
            size={40}
            onClick={() => {
              void navigator.clipboard.writeText(address).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          >
            복사
          </Button>
        </div>
      ) : null}
      <div className="event-home__applicants-head">
        <h2 id="space-pending-title" className="space-settings__title">
          대기 중인 초대
        </h2>
        {invitations.data ? <span className="event-home__count">{invitations.data.page.totalItems}건</span> : null}
      </div>
      {invitations.isPending ? <p>불러오는 중이에요.</p> : null}
      {invitations.isError ? (
        <>
          <p>초대를 불러오지 못했어요.</p>
          <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(invitations)}>
            다시 시도
          </Button>
        </>
      ) : null}
      {invitations.data && invitations.data.items.length === 0 ? <p>대기 중인 초대가 없어요.</p> : null}
      {invitations.data && invitations.data.items.length > 0 ? (
        <ul className="event-home__applicant-rows" aria-labelledby="space-pending-title">
          {invitations.data.items.map((item) => {
            const expired = Date.parse(item.expiresAt) <= invitations.dataUpdatedAt;
            return (
              <li key={item.id} className="event-home__member">
                <span className="event-home__applicant-name">{item.email}</span>
                <span className="event-home__count">{spaceRoleLabel(item.role)}</span>
                <span className="event-home__applicant-time">
                  {expired ? "만료됨" : `${formatSubmittedAt(item.expiresAt)}까지`}
                </span>
                <span className="event-home__member-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    size={40}
                    disabled={pending}
                    aria-label={`${item.email} 다시 보내기`}
                    onClick={() => resend.mutate({ id: item.id, email: item.email })}
                  >
                    다시 보내기
                  </Button>
                  <Button
                    type="button"
                    variant="danger-outline"
                    size={40}
                    disabled={pending}
                    aria-label={`${item.email} 초대 취소`}
                    onClick={() => revoke.mutate(item.id)}
                  >
                    초대 취소
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
