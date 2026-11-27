import { useState, type FormEvent, type ReactNode } from "react";
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
import { ConfirmDialog } from "./ConfirmDialog";
import { isInvitableEmail } from "./inviteEmail";
import { IssuedInvitationNotice } from "./EventOperators";
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
        // OWNER and ADMIN invite (DEC-076). The server checks again and answers 403 FORBIDDEN otherwise.
        <MembersBody spaceId={spaceId} spaceName={spaceName} canInvite={role === "OWNER" || role === "ADMIN"} />
      )}
    </SpacePage>
  );
}

type IssuedNotice = IssuedInvitation & { email: string };

function MembersBody({ spaceId, spaceName, canInvite }: { spaceId: string; spaceName: string; canInvite: boolean }) {
  const queryClient = useQueryClient();
  const [inviting, setInviting] = useState(false);
  // The invitation just sent. With mail off this holds the only copy of the link (DEC-060 Follow-up).
  const [issued, setIssued] = useState<IssuedNotice | null>(null);
  return (
    <>
      <Members
        spaceId={spaceId}
        action={
          canInvite ? (
            <Button type="button" variant="primary" size={40} className="event-home__head-action" onClick={() => setInviting(true)}>
              멤버 초대
            </Button>
          ) : null
        }
      />
      {canInvite ? <SpaceInvitations spaceId={spaceId} issued={issued} onIssued={setIssued} /> : null}
      {inviting ? (
        <SpaceInviteDialog
          spaceId={spaceId}
          spaceName={spaceName}
          onClose={() => setInviting(false)}
          onInvited={(result) => {
            setInviting(false);
            setIssued(result);
            void queryClient.invalidateQueries({ queryKey: queryKeys.spaceInvitations(spaceId) });
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The member list. The page head already says 멤버, so the card shows only the count and, for OWNER
 * and ADMIN, the invite button (P14 구성원 638:35884). The list keeps 멤버 as its accessible name.
 */
function Members({ spaceId, action }: { spaceId: string; action: ReactNode }) {
  const members = useQuery({
    queryKey: queryKeys.spaceMembers(spaceId),
    queryFn: ({ signal }) => listSpaceMembers(spaceId, signal),
  });
  return (
    <section className="space-settings__card event-home__applicants" aria-label="멤버">
      <div className="event-home__applicants-head">
        {members.data ? <span className="space-settings__count">{members.data.page.totalItems}명</span> : null}
        {action}
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
        <ul className="event-home__member-rows" aria-label="멤버">
          {members.data.items.map((item) => (
            <li key={item.userId} className="event-home__member">
              <span className="event-home__member-main">
                <span className="event-home__applicant-name">{item.displayName}</span>
                {item.email ? <span className="event-home__member-sub">{item.email}</span> : null}
              </span>
              <span className="event-home__member-role">{spaceRoleLabel(item.role)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * "멤버 초대" dialog (P14 초대 638:36189). The January screen has no role picker, so every
 * invitation is MEMBER (DEC-076). Errors stay in the dialog; a success closes it and the page shows
 * the result.
 */
function SpaceInviteDialog({
  spaceId,
  spaceName,
  onClose,
  onInvited,
}: {
  spaceId: string;
  spaceName: string;
  onClose: () => void;
  onInvited: (result: IssuedNotice) => void;
}) {
  const [email, setEmail] = useState("");
  const [alert, setAlert] = useState("");
  const [fieldError, setFieldError] = useState("");
  const create = useMutation({
    mutationFn: (input: { email: string }) => createSpaceInvitation(spaceId, input),
    onSuccess: (result, input) => onInvited({ ...result, email: input.email.trim().toLowerCase() }),
    onError: (caught) => {
      if (isApiError(caught, "VALIDATION_FAILED")) {
        if (caught.errors?.[0]?.field === "email") setFieldError("이메일을 확인해 주세요.");
        else setAlert("이미 처리된 초대예요.");
      } else if (isApiError(caught, "FORBIDDEN") || isApiError(caught, "NOT_A_MEMBER")) setAlert("초대할 권한이 없어요.");
      else if (isApiError(caught, "MAIL_SEND_FAILED")) setAlert("초대 메일을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      else setAlert("처리하지 못했어요. 다시 시도해 주세요.");
    },
  });

  function submit(form: FormEvent<HTMLFormElement>) {
    form.preventDefault();
    setAlert("");
    setFieldError("");
    if (email.trim().length === 0) {
      setFieldError("이메일을 적어 주세요.");
      return;
    }
    if (!isInvitableEmail(email)) {
      setFieldError("이메일을 확인해 주세요.");
      return;
    }
    create.mutate({ email: email.trim() });
  }

  return (
    <ConfirmDialog
      title="멤버 초대"
      scroll
      onClose={() => {
        if (!create.isPending) onClose();
      }}
      footer={
        <>
          <Button type="button" variant="secondary" size={48} disabled={create.isPending} onClick={onClose}>
            돌아가기
          </Button>
          <Button type="submit" form="space-invite-form" variant="primary" size={48} loading={create.isPending} disabled={create.isPending}>
            초대 메일 보내기
          </Button>
        </>
      }
    >
      <form id="space-invite-form" className="event-home__invite" onSubmit={submit} noValidate>
        <p className="event-home__invite-full">
          받은 사람이 메일의 링크를 열고 같은 이메일로 로그인하면 {spaceName}의 멤버가 돼요.
        </p>
        <label htmlFor="space-invite-email">이메일</label>
        <input
          id="space-invite-email"
          data-autofocus
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
        {alert ? (
          <p className="event-home__error event-home__invite-full" role="alert">
            {alert}
          </p>
        ) : null}
      </form>
    </ConfirmDialog>
  );
}

/**
 * Pending space invitations for OWNER and ADMIN, with resend and revoke. The server mails the link;
 * only with mail off does it come back once from create or resend, and then it lives only in this
 * page's state, never in localStorage, sessionStorage, the path, or the query.
 */
function SpaceInvitations({
  spaceId,
  issued,
  onIssued,
}: {
  spaceId: string;
  issued: IssuedNotice | null;
  onIssued: (next: IssuedNotice | null) => void;
}) {
  const queryClient = useQueryClient();
  const invitations = useQuery({
    queryKey: queryKeys.spaceInvitations(spaceId),
    queryFn: ({ signal }) => listSpaceInvitations(spaceId, signal),
  });
  const [alert, setAlert] = useState("");

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.spaceInvitations(spaceId) });
  }

  function fail(caught: unknown) {
    if (isApiError(caught, "VALIDATION_FAILED")) {
      setAlert("이미 처리된 초대예요.");
      refresh();
    } else if (isApiError(caught, "FORBIDDEN") || isApiError(caught, "NOT_A_MEMBER")) setAlert("초대할 권한이 없어요.");
    else if (isApiError(caught, "RESOURCE_NOT_FOUND")) {
      setAlert("초대를 찾을 수 없어요.");
      refresh();
    } else if (isApiError(caught, "MAIL_SEND_FAILED")) setAlert("초대 메일을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    else setAlert("처리하지 못했어요. 다시 시도해 주세요.");
  }

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
      setAlert("");
      onIssued({ ...result, email: target.email });
      refresh();
    },
    onError: fail,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeSpaceInvitation(spaceId, id),
    onSuccess: (_, id) => {
      if (issued?.id === id) onIssued(null);
      setAlert("");
      refresh();
    },
    onError: fail,
  });
  const pending = resend.isPending || revoke.isPending;
  const count = invitations.data?.page.totalItems ?? 0;

  return (
    <section className="space-settings__card event-home__apply" aria-labelledby="space-pending-title">
      <IssuedInvitationNotice issued={issued} />
      <div className="event-home__applicants-head">
        <h2 id="space-pending-title" className="space-settings__title">
          대기 중인 초대
        </h2>
        {count > 0 ? <span className="event-home__count">{count}건</span> : null}
      </div>
      {alert ? (
        <p className="event-home__error" role="alert">
          {alert}
        </p>
      ) : null}
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
        <ul className="event-home__member-rows" aria-labelledby="space-pending-title">
          {invitations.data.items.map((item) => {
            const expired = Date.parse(item.expiresAt) <= invitations.dataUpdatedAt;
            return (
              <li key={item.id} className="event-home__member">
                <span className="event-home__member-main">
                  <span className="event-home__applicant-name">{item.email}</span>
                  <span className="event-home__member-sub">
                    {expired ? "만료됨" : `${formatSubmittedAt(item.expiresAt)}까지`}
                  </span>
                </span>
                <span className="event-home__member-role">{spaceRoleLabel(item.role)}</span>
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
