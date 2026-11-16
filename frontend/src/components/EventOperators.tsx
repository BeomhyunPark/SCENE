import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import { isApiError } from "../api/errors";
import type { EventDetail } from "../api/events";
import {
  createInvitation,
  listInvitations,
  resendInvitation,
  revokeInvitation,
  type InvitationRole,
  type IssuedInvitation,
  type PendingInvitation,
} from "../api/invitations";
import { listOperators } from "../api/operators";
import type { ItemPage } from "../api/types";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { EventScreen } from "./EventScreen";
import { formatSubmittedAt, operatorRoleLabel } from "./eventFormat";
import { markEventArea, readEventAreas } from "./eventLocalState";
import { OperatorShell } from "./OperatorShell";
import { useEventOwner } from "./useEventOwner";
import "./EventHome.css";

/**
 * Event operators and, for the event owner, invitations. The invitation link comes back once from
 * create or resend (DEC-060 Follow-up 2026-11-16). It lives only in this component's state and is
 * not written to localStorage, sessionStorage, the path, or the query.
 */
export function EventOperators() {
  const { eventId = "" } = useParams();
  useEffect(() => {
    if (eventId) markEventArea(eventId, "operators");
  }, [eventId]);
  return (
    <EventScreen eventId={eventId}>
      {(event, spaceName) => <OperatorsBody event={event} spaceName={spaceName} />}
    </EventScreen>
  );
}

function OperatorsBody({ event, spaceName }: { event: EventDetail; spaceName?: string }) {
  const eventId = event.eventId;
  const owner = useEventOwner(eventId);
  const operators = useQuery({
    queryKey: queryKeys.operators(eventId),
    queryFn: () => listOperators(eventId),
  });
  const archived = event.lifecycleStatus === "ARCHIVED";

  return (
    <OperatorShell
      title="운영 멤버"
      spaceName={spaceName}
      eventName={event.name}
      eventHref={`/events/${eventId}`}
      eventAreas={readEventAreas(eventId)}
      participantsHref={`/events/${eventId}/participants`}
      tasksHref={`/events/${eventId}/tasks`}
      framed
      leading={
        <Link className="event-home__back" to={`/events/${eventId}`} aria-label="행사로">
          <img src={arrowLeft} alt="" />
        </Link>
      }
    >
      <div className="event-home">
        <section className="event-home__applicants" aria-labelledby="operators-title">
          <div className="event-home__applicants-head">
            <h2 id="operators-title">운영자</h2>
            {operators.data ? <span className="event-home__count">{operators.data.page.totalItems}명</span> : null}
          </div>
          {operators.isPending ? <p>불러오는 중이에요.</p> : null}
          {operators.isError ? (
            <>
              <p>운영자를 불러오지 못했어요.</p>
              <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(operators)}>
                다시 시도
              </Button>
            </>
          ) : null}
          {operators.data ? (
            <ul className="event-home__applicant-rows">
              {operators.data.items.map((item) => (
                <li key={item.userId} className="event-home__member">
                  <span className="event-home__applicant-name">{item.displayName}</span>
                  <span className="event-home__count">{operatorRoleLabel(item.role)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        {owner.isOwner ? <Invitations eventId={eventId} archived={archived} /> : null}
      </div>
    </OperatorShell>
  );
}

function Invitations({ eventId, archived }: { eventId: string; archived: boolean }) {
  const queryClient = useQueryClient();
  const invitations = useQuery({
    queryKey: queryKeys.invitations(eventId),
    queryFn: ({ signal }) => listInvitations(eventId, signal),
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitationRole>("STAFF");
  const [issued, setIssued] = useState<(IssuedInvitation & { email: string }) | null>(null);
  const [copied, setCopied] = useState(false);
  const [alert, setAlert] = useState("");
  const [fieldError, setFieldError] = useState("");

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.invitations(eventId) });
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
    if (isApiError(caught, "EVENT_ARCHIVED")) setAlert("보관된 행사에는 초대할 수 없어요.");
    else if (isApiError(caught, "FORBIDDEN")) setAlert("초대할 권한이 없어요.");
    else if (isApiError(caught, "RESOURCE_NOT_FOUND")) {
      setAlert("초대를 찾을 수 없어요.");
      refresh();
    } else setAlert("처리하지 못했어요. 다시 시도해 주세요.");
  }

  const create = useMutation({
    mutationFn: (input: { email: string; role: InvitationRole }) => createInvitation(eventId, input),
    onSuccess: (result, input) => {
      show(result, input.email.trim().toLowerCase());
      setEmail("");
    },
    onError: fail,
  });
  const resend = useMutation({
    mutationFn: (target: { id: string; email: string }) => resendInvitation(eventId, target.id),
    onSuccess: (result, target) => {
      // The old row is SUPERSEDED now. Swap it before the refetch so a quick click cannot hit it.
      queryClient.setQueryData<ItemPage<PendingInvitation>>(queryKeys.invitations(eventId), (current) =>
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
    mutationFn: (id: string) => revokeInvitation(eventId, id),
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
    create.mutate({ email: email.trim(), role });
  }

  const address = issued ? `${window.location.origin}${issued.link}` : "";

  return (
    <section className="event-home__apply" aria-labelledby="invite-title">
      <h2 id="invite-title">초대하기</h2>
      <p>초대 링크를 만들어 직접 보내 주세요. 링크는 지금 한 번만 보여요.</p>
      {archived ? (
        <p>보관된 행사에는 초대할 수 없어요.</p>
      ) : (
        <form className="event-home__invite" onSubmit={submit} noValidate>
          <label htmlFor="invite-email">이메일</label>
          <input
            id="invite-email"
            className="event-home__address"
            type="email"
            autoComplete="off"
            value={email}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? "invite-email-error" : undefined}
            onChange={(change) => setEmail(change.target.value)}
          />
          {fieldError ? (
            <p id="invite-email-error" className="event-home__error">
              {fieldError}
            </p>
          ) : null}
          <label htmlFor="invite-role">역할</label>
          <select
            id="invite-role"
            className="event-home__select"
            value={role}
            onChange={(change) => setRole(change.target.value === "MANAGER" ? "MANAGER" : "STAFF")}
          >
            <option value="STAFF">{operatorRoleLabel("STAFF")}</option>
            <option value="MANAGER">{operatorRoleLabel("MANAGER")}</option>
          </select>
          <Button type="submit" variant="primary" size={40} loading={create.isPending} disabled={pending}>
            초대 링크 만들기
          </Button>
        </form>
      )}
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
        <h2 id="pending-title">대기 중인 초대</h2>
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
        <ul className="event-home__applicant-rows" aria-labelledby="pending-title">
          {invitations.data.items.map((item) => {
            const expired = Date.parse(item.expiresAt) <= invitations.dataUpdatedAt;
            return (
              <li key={item.id} className="event-home__member">
                <span className="event-home__applicant-name">{item.email}</span>
                <span className="event-home__count">{operatorRoleLabel(item.role)}</span>
                <span className="event-home__applicant-time">
                  {expired ? "만료됨" : `${formatSubmittedAt(item.expiresAt)}까지`}
                </span>
                {archived ? null : (
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
                      취소
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
