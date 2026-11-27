import { withJosa } from "./josa";
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
import { RowMenu, type RowMenuItem } from "./RowMenu";
import { Select } from "./Select";
import { useEventOwner } from "./useEventOwner";
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
  const queryClient = useQueryClient();
  const operators = useQuery({
    queryKey: queryKeys.operators(eventId),
    queryFn: () => listOperators(eventId),
  });
  const archived = event.lifecycleStatus === "ARCHIVED";
  const [adding, setAdding] = useState(false);
  // One status line under the operators: an added member or a row action that finished.
  const [done, setDone] = useState("");
  // The invitation just sent. With mail off this holds the only copy of the link (DEC-060 Follow-up).
  const [issued, setIssued] = useState<IssuedNotice | null>(null);

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
            {owner.isOwner && !archived ? (
              <Button
                type="button"
                variant="primary"
                size={40}
                className="event-home__head-action"
                onClick={() => setAdding(true)}
              >
                운영자 추가
              </Button>
            ) : null}
          </div>
          {owner.isOwner && archived ? (
            <p>보관된 행사에는 운영자를 추가할 수 없어요. 역할은 바꿀 수 없고 운영자 빼기는 할 수 있어요.</p>
          ) : null}
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
            <OperatorRows
              eventId={eventId}
              items={operators.data.items}
              manage={owner.isOwner}
              archived={archived}
              done={done}
              onDone={(message) => {
                setIssued(null);
                setDone(message);
              }}
            />
          ) : null}
        </section>
        {owner.isOwner ? (
          <Invitations eventId={eventId} archived={archived} issued={issued} onIssued={setIssued} />
        ) : null}
        {adding ? (
          <AddOperatorDialog
            eventId={eventId}
            spaceId={event.spaceId}
            operators={operators.data?.items}
            onClose={() => setAdding(false)}
            onAdded={(message) => {
              setAdding(false);
              setIssued(null);
              setDone(message);
            }}
            onInvited={(result) => {
              setAdding(false);
              setDone("");
              setIssued(result);
              void queryClient.invalidateQueries({ queryKey: queryKeys.invitations(eventId) });
            }}
          />
        ) : null}
      </div>
    </OperatorShell>
  );
}

type IssuedNotice = IssuedInvitation & { email: string };

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
 * All three sit in the row's "⋯" menu (SCENE DS Menu 37:47, #494).
 */
function OperatorRows({
  eventId,
  items,
  manage,
  archived,
  done,
  onDone,
}: {
  eventId: string;
  items: EventOperator[];
  manage: boolean;
  archived: boolean;
  done: string;
  onDone: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<ManageAction | null>(null);
  const [alert, setAlert] = useState("");

  function refresh() {
    // Also reloads every permissions query, which sits under the operators key.
    void queryClient.invalidateQueries({ queryKey: queryKeys.operators(eventId) });
  }

  function fail(caught: unknown, target: EventOperator, kind: "role" | "remove") {
    onDone("");
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
      onDone(`${input.target.displayName}님의 역할을 ${withJosa(operatorRoleLabel(changed.role), "으로/로")} 바꿨어요.`);
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
      onDone(`${target.displayName}님을 행사 운영자에서 뺐어요.`);
    },
    onError: (caught, target) => fail(caught, target, "remove"),
  });
  const pending = change.isPending || remove.isPending;

  function menuItems(item: EventOperator): RowMenuItem[] {
    const other: AddOperatorRole = item.role === "MANAGER" ? "STAFF" : "MANAGER";
    return [
      {
        label: "권한",
        onSelect: () => {
          setAlert("");
          onDone("");
          setAction({ kind: "permissions", target: item });
        },
      },
      // An archived event allows no role change, only a removal (DEC-029 2026-10-02 보강).
      ...(archived
        ? []
        : [
            {
              label: `${withJosa(operatorRoleLabel(other), "으로/로")} 변경`,
              onSelect: () => setAction({ kind: "role", target: item, role: other }),
            },
          ]),
      { label: "빼기", danger: true, onSelect: () => setAction({ kind: "remove", target: item }) },
    ];
  }

  return (
    <>
      <ul className="event-home__member-rows" aria-labelledby="operators-title">
        {items.map((item) => (
          <li key={item.userId} className="event-home__member">
            <span className="event-home__member-main">
              <span className="event-home__applicant-name">{item.displayName}</span>
              {manage && item.role !== "OWNER" ? <PermissionSummary eventId={eventId} userId={item.userId} /> : null}
            </span>
            <span className="event-home__member-role">{operatorRoleLabel(item.role)}</span>
            {manage ? (
              item.role !== "OWNER" ? (
                <RowMenu label={`${item.displayName} 메뉴`} disabled={pending} items={menuItems(item)} />
              ) : (
                <span className="event-home__member-menu-space" aria-hidden="true" />
              )
            ) : null}
          </li>
        ))}
      </ul>
      {alert ? (
        <p className="event-home__error" role="alert">
          {alert}
        </p>
      ) : null}
      {done ? <p role="status">{done}</p> : null}
      {action?.kind === "role" ? (
        <ConfirmDialog
          title={`${action.target.displayName}님을 ${withJosa(operatorRoleLabel(action.role), "으로/로")} 바꿀까요?`}
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
            {operatorRoleLabel(action.target.role)}에서 {withJosa(operatorRoleLabel(action.role), "으로/로")} 바뀌어요. 이 사람에게 따로 준
            개별 권한은 모두 초기화되고 {operatorRoleLabel(action.role)} 기본 권한만 남아요.
          </p>
          <p>
            {withJosa(operatorRoleLabel(action.role), "은/는")} {ROLE_SUMMARY[action.role]}.
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
            onDone(message);
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

type AddWay = "member" | "email";

/**
 * "운영자 추가" dialog for the event OWNER. One place to bring someone in: an active member of the
 * event's own organization is added directly (POST /operators, DEC-076, #387), and anyone else is
 * invited by email. The role picker and its one-line summary appear once and serve both ways
 * (DEC-079 Follow-up). Errors stay in the dialog; a success closes it and reports on the page.
 */
function AddOperatorDialog({
  eventId,
  spaceId,
  operators,
  onClose,
  onAdded,
  onInvited,
}: {
  eventId: string;
  spaceId: string;
  operators: EventOperator[] | undefined;
  onClose: () => void;
  onAdded: (message: string) => void;
  onInvited: (result: IssuedNotice) => void;
}) {
  const queryClient = useQueryClient();
  const members = useQuery({
    queryKey: queryKeys.spaceMembers(spaceId),
    queryFn: ({ signal }) => listSpaceMembers(spaceId, signal),
    enabled: spaceId.length > 0,
  });
  const [way, setWay] = useState<AddWay>("member");
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AddOperatorRole>("STAFF");
  const [alert, setAlert] = useState("");
  const [fieldError, setFieldError] = useState("");

  const operatorIds = new Set((operators ?? []).map((item) => item.userId));
  const candidates = operators ? (members.data?.items ?? []).filter((item) => !operatorIds.has(item.userId)) : [];
  const selected = candidates.some((item) => item.userId === userId) ? userId : (candidates[0]?.userId ?? "");

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
      void queryClient.invalidateQueries({ queryKey: queryKeys.operators(eventId) });
      onAdded(`${added.displayName}님을 ${operatorRoleLabel(added.role)} 역할로 추가했어요.`);
    },
    onError: (caught) => {
      if (isApiError(caught, "VALIDATION_FAILED") && caught.errors?.[0]?.field === "userId") {
        setAlert("이미 이 행사의 운영자예요.");
        void queryClient.invalidateQueries({ queryKey: queryKeys.operators(eventId) });
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
  const invite = useMutation({
    mutationFn: (input: { email: string; role: InvitationRole }) => createInvitation(eventId, input),
    onSuccess: (result, input) => onInvited({ ...result, email: input.email.trim().toLowerCase() }),
    onError: (caught) => {
      if (isApiError(caught, "VALIDATION_FAILED")) {
        if (caught.errors?.[0]?.field === "email") setFieldError("이메일을 확인해 주세요.");
        else setAlert("이미 처리된 초대예요.");
      } else if (isApiError(caught, "EVENT_ARCHIVED")) setAlert("보관된 행사에는 초대할 수 없어요.");
      else if (isApiError(caught, "FORBIDDEN")) setAlert("초대할 권한이 없어요.");
      else if (isApiError(caught, "MAIL_SEND_FAILED")) setAlert("초대 메일을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      else setAlert("처리하지 못했어요. 다시 시도해 주세요.");
    },
  });
  const pending = add.isPending || invite.isPending;
  const membersReady = members.data !== undefined && operators !== undefined;

  function submit(form?: FormEvent<HTMLFormElement>) {
    form?.preventDefault();
    setAlert("");
    setFieldError("");
    if (way === "member") {
      if (selected) add.mutate({ userId: selected, role });
      return;
    }
    if (email.trim().length === 0) {
      setFieldError("이메일을 적어 주세요.");
      return;
    }
    invite.mutate({ email: email.trim(), role });
  }

  const canSubmit = way === "email" || selected.length > 0;

  return (
    <ConfirmDialog
      title="운영자 추가"
      scroll
      onClose={() => {
        if (!pending) onClose();
      }}
      footer={
        <>
          <Button type="button" variant="secondary" size={48} disabled={pending} onClick={onClose}>
            돌아가기
          </Button>
          <Button
            type="submit"
            form="operator-add-form"
            variant="primary"
            size={48}
            loading={pending}
            disabled={pending || !canSubmit}
          >
            {way === "member" ? "운영자로 추가" : "초대 메일 보내기"}
          </Button>
        </>
      }
    >
      <form id="operator-add-form" className="event-home__invite" onSubmit={submit} noValidate>
        <div className="event-home__segments" role="radiogroup" aria-label="운영자 추가">
          {(
            [
              ["member", "조직 멤버 추가"],
              ["email", "외부 협력자 초대"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={`event-home__segment scene-press scene-press--chip${way === value ? " event-home__segment--on" : ""}`}>
              <input
                type="radio"
                name="operator-add-way"
                checked={way === value}
                onChange={() => {
                  setWay(value);
                  setAlert("");
                  setFieldError("");
                }}
              />
              {label}
            </label>
          ))}
        </div>
        {way === "member" ? (
          <>
            {!membersReady && !members.isError ? <p>불러오는 중이에요.</p> : null}
            {members.isError ? (
              <div className="event-home__invite-full">
                <p>조직 멤버를 불러오지 못했어요.</p>
                <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(members)}>
                  다시 시도
                </Button>
              </div>
            ) : null}
            {membersReady && candidates.length === 0 ? (
              <p>추가할 수 있는 조직 멤버가 없어요. 모두 이 행사의 운영자예요.</p>
            ) : null}
            {candidates.length > 0 ? (
              <>
                <label htmlFor="operator-add-user">조직 멤버</label>
                <Select
                  id="operator-add-user"
                  className="event-home__select"
                  value={selected}
                  options={candidates.map((item) => ({
                    value: item.userId,
                    label: item.email ? `${item.displayName} (${item.email})` : item.displayName,
                  }))}
                  onChange={setUserId}
                />
              </>
            ) : null}
          </>
        ) : (
          <>
            <p className="event-home__invite-full">받은 메일의 링크를 열고 같은 이메일로 로그인하면 운영 멤버가 돼요.</p>
            <label htmlFor="operator-add-email">이메일</label>
            <input
              id="operator-add-email"
              className="event-home__address"
              type="email"
              autoComplete="off"
              value={email}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? "operator-add-email-error" : undefined}
              onChange={(change) => setEmail(change.target.value)}
            />
            {fieldError ? (
              <p id="operator-add-email-error" className="event-home__error">
                {fieldError}
              </p>
            ) : null}
          </>
        )}
        {way === "email" || candidates.length > 0 ? (
          <>
            <label htmlFor="operator-add-role">역할</label>
            <Select
              id="operator-add-role"
              className="event-home__select"
              value={role}
              aria-describedby="operator-add-role-summary"
              options={[
                { value: "STAFF", label: operatorRoleLabel("STAFF") },
                { value: "MANAGER", label: operatorRoleLabel("MANAGER") },
              ]}
              onChange={(value) => setRole(value === "MANAGER" ? "MANAGER" : "STAFF")}
            />
            <RoleSummary id="operator-add-role-summary" />
          </>
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

/** Pending invitations with resend and revoke, and the notice for the invitation just sent. */
function Invitations({
  eventId,
  archived,
  issued,
  onIssued,
}: {
  eventId: string;
  archived: boolean;
  issued: IssuedNotice | null;
  onIssued: (next: IssuedNotice | null) => void;
}) {
  const queryClient = useQueryClient();
  const invitations = useQuery({
    queryKey: queryKeys.invitations(eventId),
    queryFn: ({ signal }) => listInvitations(eventId, signal),
  });
  const [alert, setAlert] = useState("");

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.invitations(eventId) });
  }

  function fail(caught: unknown) {
    if (isApiError(caught, "VALIDATION_FAILED")) {
      setAlert("이미 처리된 초대예요.");
      refresh();
    } else if (isApiError(caught, "EVENT_ARCHIVED")) setAlert("보관된 행사에는 초대할 수 없어요.");
    else if (isApiError(caught, "FORBIDDEN")) setAlert("초대할 권한이 없어요.");
    else if (isApiError(caught, "RESOURCE_NOT_FOUND")) {
      setAlert("초대를 찾을 수 없어요.");
      refresh();
    } else if (isApiError(caught, "MAIL_SEND_FAILED")) setAlert("초대 메일을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    else setAlert("처리하지 못했어요. 다시 시도해 주세요.");
  }

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
      setAlert("");
      onIssued({ ...result, email: target.email });
      refresh();
    },
    onError: fail,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeInvitation(eventId, id),
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
    <section className="event-home__apply" aria-labelledby="pending-title">
      <IssuedInvitationNotice issued={issued} />
      <div className="event-home__applicants-head">
        <h2 id="pending-title">대기 중인 초대</h2>
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
        <ul className="event-home__member-rows" aria-labelledby="pending-title">
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
                <span className="event-home__member-role">{operatorRoleLabel(item.role)}</span>
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

/**
 * Result of the invitation just sent or resent. With mail on, one line; with mail off on the
 * server, the link shown once with a copy button (DEC-060 Follow-up 2026-11-16).
 */
export function IssuedInvitationNotice({ issued }: { issued: IssuedNotice | null }) {
  const [copied, setCopied] = useState("");
  if (!issued) return null;
  if (issued.delivery === "EMAIL") {
    return (
      <div className="event-home__issued" role="status">
        <p>
          {issued.email}에게 초대 메일을 보냈어요. 링크는 {formatSubmittedAt(issued.expiresAt)}까지 쓸 수 있어요.
        </p>
      </div>
    );
  }
  const address = issued.link ? `${window.location.origin}${issued.link}` : "";
  return (
    <div className="event-home__issued" role="status">
      <p>
        메일 발송이 꺼져 있어 링크를 직접 전달해 주세요. {issued.email}에게 보낼 링크예요. 이 화면을 떠나면 다시 볼 수
        없어요.
      </p>
      <input className="event-home__address" readOnly aria-label="초대 링크" value={address} />
      {copied === issued.id ? <p>복사했어요.</p> : null}
      <Button
        type="button"
        variant="secondary"
        size={40}
        onClick={() => {
          void navigator.clipboard.writeText(address).then(
            () => setCopied(issued.id),
            () => setCopied(""),
          );
        }}
      >
        복사
      </Button>
    </div>
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
