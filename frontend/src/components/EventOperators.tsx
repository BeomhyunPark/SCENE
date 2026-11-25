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
import {
  addOperator,
  changeOperatorRole,
  listOperators,
  removeOperator,
  type AddOperatorRole,
  type EventOperator,
} from "../api/operators";
import { listSpaceMembers } from "../api/spaceInvitations";
import type { ItemPage } from "../api/types";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { EventScreen } from "./EventScreen";
import { formatSubmittedAt, operatorRoleLabel } from "./eventFormat";
import { markEventArea, readEventAreas } from "./eventLocalState";
import { OperatorPermissionDialog, PermissionSummary } from "./OperatorPermissionEditor";
import { ROLE_SUMMARY } from "./operatorPermissions";
import { OperatorShell } from "./OperatorShell";
import { useEventOwner } from "./useEventOwner";
import { Select } from "./Select";
import "./EventHome.css";

/**
 * Event operators and, for the event owner, a direct add of organization members (DEC-076) and
 * invitations for outside collaborators. The server mails the invitation link to the invited
 * address; only when mail is off on that server does the link come back once from
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
        <Link className="event-home__back scene-press scene-press--text" to={`/events/${eventId}`} aria-label="행사로">
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
            <OperatorRows eventId={eventId} items={operators.data.items} manage={owner.isOwner} archived={archived} />
          ) : null}
        </section>
        {owner.isOwner ? (
          <MemberAdd
            eventId={eventId}
            spaceId={event.spaceId}
            archived={archived}
            operators={operators.data?.items}
          />
        ) : null}
        {owner.isOwner ? <Invitations eventId={eventId} archived={archived} /> : null}
      </div>
    </OperatorShell>
  );
}

type ManageAction =
  | { kind: "role"; target: EventOperator; role: AddOperatorRole }
  | { kind: "remove"; target: EventOperator }
  | { kind: "permissions"; target: EventOperator };

/**
 * Operator rows. The event OWNER also gets a role change (MANAGER and STAFF) and a removal on every
 * row except OWNER rows (#371). Both ask first: a role change resets the person's individual
 * permissions, and a removal leaves their tasks without an assignee. An archived event still allows
 * a removal, because the server only blocks changes that widen access there (DEC-029 2026-10-02 보강).
 * The owner also opens each non-owner's permissions to turn individual keys on and off (DEC-079).
 */
function OperatorRows({
  eventId,
  items,
  manage,
  archived,
}: {
  eventId: string;
  items: EventOperator[];
  manage: boolean;
  archived: boolean;
}) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<ManageAction | null>(null);
  const [alert, setAlert] = useState("");
  const [done, setDone] = useState("");

  function refresh() {
    // Also reloads every permissions query, which sits under the operators key.
    void queryClient.invalidateQueries({ queryKey: queryKeys.operators(eventId) });
  }

  function fail(caught: unknown, target: EventOperator, kind: "role" | "remove") {
    setDone("");
    setAction(null);
    if (isApiError(caught, "EVENT_ARCHIVED")) {
      setAlert("보관된 행사에서는 운영자 역할을 바꿀 수 없어요.");
    } else if (isApiError(caught, "RESOURCE_NOT_FOUND")) {
      setAlert(`${target.displayName}님은 이미 이 행사의 운영자가 아니에요. 목록을 새로 불러왔어요.`);
      refresh();
    } else if (isApiError(caught, "FORBIDDEN") || isApiError(caught, "NOT_A_MEMBER")) {
      setAlert(kind === "role" ? "운영자 역할을 바꿀 권한이 없어요." : "운영자를 뺄 권한이 없어요.");
      refresh();
    } else if (isApiError(caught, "VALIDATION_FAILED")) {
      setAlert("바꿀 수 없는 역할이에요.");
    } else {
      setAlert(kind === "role" ? "역할을 바꾸지 못했어요. 다시 시도해 주세요." : "빼지 못했어요. 다시 시도해 주세요.");
    }
  }

  const change = useMutation({
    mutationFn: (input: { target: EventOperator; role: AddOperatorRole }) =>
      changeOperatorRole(eventId, input.target.userId, input.role),
    onSuccess: (changed, input) => {
      queryClient.setQueryData<ItemPage<EventOperator>>(queryKeys.operators(eventId), (current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) => (item.userId === changed.userId ? { ...item, ...changed } : item)),
            }
          : current,
      );
      refresh();
      setAction(null);
      setAlert("");
      setDone(`${input.target.displayName}님의 역할을 ${operatorRoleLabel(changed.role)}로 바꿨어요.`);
    },
    onError: (caught, input) => fail(caught, input.target, "role"),
  });
  const remove = useMutation({
    mutationFn: (target: EventOperator) => removeOperator(eventId, target.userId),
    onSuccess: (_, target) => {
      queryClient.setQueryData<ItemPage<EventOperator>>(queryKeys.operators(eventId), (current) =>
        current && current.items.some((item) => item.userId === target.userId)
          ? {
              ...current,
              items: current.items.filter((item) => item.userId !== target.userId),
              page: { ...current.page, totalItems: Math.max(0, current.page.totalItems - 1) },
            }
          : current,
      );
      refresh();
      // The server cleared the assignee on their tasks.
      void queryClient.invalidateQueries({ queryKey: queryKeys.allTasks(eventId) });
      setAction(null);
      setAlert("");
      setDone(`${target.displayName}님을 행사 운영자에서 뺐어요.`);
    },
    onError: (caught, target) => fail(caught, target, "remove"),
  });
  const pending = change.isPending || remove.isPending;

  return (
    <>
      {manage && archived ? <p>보관된 행사에서는 역할을 바꿀 수 없어요. 운영자 빼기는 할 수 있어요.</p> : null}
      <ul className="event-home__applicant-rows">
        {items.map((item) => {
          const other: AddOperatorRole = item.role === "MANAGER" ? "STAFF" : "MANAGER";
          return (
            <li key={item.userId} className="event-home__member">
              <span className="event-home__applicant-name">{item.displayName}</span>
              <span className="event-home__count">{operatorRoleLabel(item.role)}</span>
              {manage && item.role !== "OWNER" ? <PermissionSummary eventId={eventId} userId={item.userId} /> : null}
              {manage && item.role !== "OWNER" ? (
                <span className="event-home__member-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    size={40}
                    disabled={pending}
                    aria-label={`${item.displayName} 권한`}
                    onClick={() => {
                      setAlert("");
                      setDone("");
                      setAction({ kind: "permissions", target: item });
                    }}
                  >
                    권한
                  </Button>
                  {archived ? null : (
                    <Button
                      type="button"
                      variant="secondary"
                      size={40}
                      disabled={pending}
                      aria-label={`${item.displayName} ${operatorRoleLabel(other)}로 변경`}
                      onClick={() => setAction({ kind: "role", target: item, role: other })}
                    >
                      {operatorRoleLabel(other)}로 변경
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="danger-outline"
                    size={40}
                    disabled={pending}
                    aria-label={`${item.displayName} 빼기`}
                    onClick={() => setAction({ kind: "remove", target: item })}
                  >
                    빼기
                  </Button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {alert ? (
        <p className="event-home__error" role="alert">
          {alert}
        </p>
      ) : null}
      {done ? <p role="status">{done}</p> : null}
      {action?.kind === "role" ? (
        <ConfirmDialog
          title={`${action.target.displayName}님을 ${operatorRoleLabel(action.role)}로 바꿀까요?`}
          onClose={() => {
            if (!change.isPending) setAction(null);
          }}
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                size={48}
                disabled={change.isPending}
                onClick={() => setAction(null)}
              >
                돌아가기
              </Button>
              <Button
                type="button"
                variant="primary"
                size={48}
                loading={change.isPending}
                onClick={() => change.mutate({ target: action.target, role: action.role })}
              >
                역할 바꾸기
              </Button>
            </>
          }
        >
          <p>
            {operatorRoleLabel(action.target.role)}에서 {operatorRoleLabel(action.role)}로 바뀌어요. 이 사람에게 따로 준
            개별 권한은 모두 초기화되고 {operatorRoleLabel(action.role)} 기본 권한만 남아요.
          </p>
          <p>
            {operatorRoleLabel(action.role)}는 {ROLE_SUMMARY[action.role]}.
          </p>
        </ConfirmDialog>
      ) : null}
      {action?.kind === "permissions" ? (
        <OperatorPermissionDialog
          eventId={eventId}
          target={action.target}
          archived={archived}
          onClose={() => setAction(null)}
          onSaved={(message) => {
            setAction(null);
            setDone(message);
          }}
        />
      ) : null}
      {action?.kind === "remove" ? (
        <ConfirmDialog
          title={`${action.target.displayName}님을 행사에서 뺄까요?`}
          onClose={() => {
            if (!remove.isPending) setAction(null);
          }}
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                size={48}
                disabled={remove.isPending}
                onClick={() => setAction(null)}
              >
                돌아가기
              </Button>
              <Button
                type="button"
                variant="danger"
                size={48}
                loading={remove.isPending}
                onClick={() => remove.mutate(action.target)}
              >
                빼기
              </Button>
            </>
          }
        >
          <p>
            이 사람이 담당하던 업무는 담당자가 비워지고, 이 행사의 운영 화면에 더 들어올 수 없어요. 다시 함께하려면
            운영자로 다시 추가해 주세요.
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

/**
 * Event OWNER picks an active space member who is not yet an operator and adds them as MANAGER or
 * STAFF (POST /operators). Outsiders still come in through an invitation link. The members are
 * those of the event's own organization, not the first organization in the list (#387).
 */
function MemberAdd({
  eventId,
  spaceId,
  archived,
  operators,
}: {
  eventId: string;
  spaceId: string;
  archived: boolean;
  operators: EventOperator[] | undefined;
}) {
  const queryClient = useQueryClient();
  const members = useQuery({
    queryKey: queryKeys.spaceMembers(spaceId),
    queryFn: ({ signal }) => listSpaceMembers(spaceId, signal),
    enabled: spaceId.length > 0 && !archived,
  });
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<AddOperatorRole>("STAFF");
  const [alert, setAlert] = useState("");
  const [done, setDone] = useState("");

  const operatorIds = new Set((operators ?? []).map((item) => item.userId));
  const candidates = operators ? (members.data?.items ?? []).filter((item) => !operatorIds.has(item.userId)) : [];
  const selected = candidates.some((item) => item.userId === userId) ? userId : (candidates[0]?.userId ?? "");

  function refreshOperators() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.operators(eventId) });
  }

  const add = useMutation({
    mutationFn: (input: { userId: string; role: AddOperatorRole }) => addOperator(eventId, input),
    onSuccess: (added) => {
      queryClient.setQueryData<ItemPage<EventOperator>>(queryKeys.operators(eventId), (current) =>
        current && !current.items.some((item) => item.userId === added.userId)
          ? {
              ...current,
              items: [...current.items, added],
              page: { ...current.page, totalItems: current.page.totalItems + 1 },
            }
          : current,
      );
      refreshOperators();
      setAlert("");
      setDone(`${added.displayName}님을 ${operatorRoleLabel(added.role)} 역할로 추가했어요.`);
      setUserId("");
    },
    onError: (caught) => {
      setDone("");
      if (isApiError(caught, "VALIDATION_FAILED") && caught.errors?.[0]?.field === "userId") {
        setAlert("이미 이 행사의 운영자예요.");
        refreshOperators();
      } else if (isApiError(caught, "RESOURCE_NOT_FOUND")) {
        setAlert("조직 멤버가 아니라서 추가할 수 없어요. 멤버 목록을 새로 불러왔어요.");
        void queryClient.invalidateQueries({ queryKey: queryKeys.spaceMembers(spaceId) });
      } else if (isApiError(caught, "EVENT_ARCHIVED")) {
        setAlert("보관된 행사에는 운영자를 추가할 수 없어요.");
      } else if (isApiError(caught, "FORBIDDEN") || isApiError(caught, "NOT_A_MEMBER")) {
        setAlert("운영자를 추가할 권한이 없어요.");
      } else {
        setAlert("추가하지 못했어요. 다시 시도해 주세요.");
      }
    },
  });

  function submit(form: FormEvent<HTMLFormElement>) {
    form.preventDefault();
    if (!selected) return;
    add.mutate({ userId: selected, role });
  }

  return (
    <section className="event-home__apply" aria-labelledby="member-add-title">
      <h2 id="member-add-title">조직 멤버 추가</h2>
      <p>조직 멤버는 링크 없이 바로 운영자로 추가해요.</p>
      {archived ? <p>보관된 행사에는 운영자를 추가할 수 없어요.</p> : null}
      {!archived && (members.isPending || !operators) ? <p>불러오는 중이에요.</p> : null}
      {!archived && members.isError ? (
        <>
          <p>조직 멤버를 불러오지 못했어요.</p>
          <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(members)}>
            다시 시도
          </Button>
        </>
      ) : null}
      {!archived && members.data && operators && candidates.length === 0 ? (
        <p>추가할 수 있는 조직 멤버가 없어요. 모두 이 행사의 운영자예요.</p>
      ) : null}
      {!archived && candidates.length > 0 ? (
        <form className="event-home__invite" onSubmit={submit} noValidate>
          <label htmlFor="member-add-user">조직 멤버</label>
          <Select
            id="member-add-user"
            className="event-home__select"
            value={selected}
            options={candidates.map((item) => ({
              value: item.userId,
              label: item.email ? `${item.displayName} (${item.email})` : item.displayName,
            }))}
            onChange={setUserId}
          />
          <label htmlFor="member-add-role">추가할 역할</label>
          <Select
            id="member-add-role"
            className="event-home__select"
            value={role}
            aria-describedby="member-add-role-summary"
            options={[
              { value: "STAFF", label: operatorRoleLabel("STAFF") },
              { value: "MANAGER", label: operatorRoleLabel("MANAGER") },
            ]}
            onChange={(value) => setRole(value === "MANAGER" ? "MANAGER" : "STAFF")}
          />
          <RoleSummary id="member-add-role-summary" />
          <Button type="submit" variant="primary" size={40} loading={add.isPending} disabled={add.isPending}>
            운영자로 추가
          </Button>
        </form>
      ) : null}
      {alert ? (
        <p className="event-home__error" role="alert">
          {alert}
        </p>
      ) : null}
      {done ? <p role="status">{done}</p> : null}
    </section>
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
    } else if (isApiError(caught, "MAIL_SEND_FAILED")) setAlert("초대 메일을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    else setAlert("처리하지 못했어요. 다시 시도해 주세요.");
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

  const address = issued?.link ? `${window.location.origin}${issued.link}` : "";

  return (
    <section className="event-home__apply" aria-labelledby="invite-title">
      <h2 id="invite-title">외부 협력자 초대</h2>
      <p>조직 멤버가 아닌 분은 이메일로 초대해 주세요. 받은 메일의 링크를 열고 같은 이메일로 로그인하면 운영 멤버가 돼요.</p>
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
          <Select
            id="invite-role"
            className="event-home__select"
            value={role}
            aria-describedby="invite-role-summary"
            options={[
              { value: "STAFF", label: operatorRoleLabel("STAFF") },
              { value: "MANAGER", label: operatorRoleLabel("MANAGER") },
            ]}
            onChange={(value) => setRole(value === "MANAGER" ? "MANAGER" : "STAFF")}
          />
          <RoleSummary id="invite-role-summary" />
          <Button type="submit" variant="primary" size={40} loading={create.isPending} disabled={pending}>
            초대 메일 보내기
          </Button>
        </form>
      )}
      {alert ? (
        <p className="event-home__error" role="alert">
          {alert}
        </p>
      ) : null}
      {issued?.delivery === "EMAIL" ? (
        <div className="event-home__issued" role="status">
          <p>
            {issued.email}에게 초대 메일을 보냈어요. 링크는 {formatSubmittedAt(issued.expiresAt)}까지 쓸 수 있어요.
          </p>
        </div>
      ) : null}
      {issued?.delivery === "LINK" ? (
        <div className="event-home__issued" role="status">
          <p>
            메일 발송이 꺼져 있어 링크를 직접 전달해 주세요. {issued.email}에게 보낼 링크예요. 이 화면을 떠나면 다시 볼
            수 없어요.
          </p>
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
                      초대 취소
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

/** One line on what MANAGER and STAFF do by default, under the role picker (DEC-079 Follow-up). */
function RoleSummary({ id }: { id: string }) {
  return (
    <p id={id} className="event-home__role-summary">
      {operatorRoleLabel("MANAGER")}: {ROLE_SUMMARY.MANAGER} · {operatorRoleLabel("STAFF")}: {ROLE_SUMMARY.STAFF}
    </p>
  );
}
