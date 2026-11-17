import { useState, useSyncExternalStore, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import { isApiError } from "../api/errors";
import type { EventDetail, LifecycleStatus } from "../api/events";
import {
  ASSIGNMENT_CHANGES_MAX,
  GROUP_LEADERS_MAX,
  GROUP_NAME_MAX,
  assignParticipants,
  assignmentConflicts,
  createGroup,
  deleteGroup,
  getGroupBoard,
  publishGroups,
  problemCount,
  problemParticipantIds,
  problemReason,
  renameGroup,
  reorderGroups,
  setGroupLeaders,
  type AttendanceSlot,
  type BoardParticipant,
  type Group,
  type GroupBoard,
} from "../api/groups";
import { getMyPermissions } from "../api/operators";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { getMe } from "../api/session";
import { Button } from "./Button";
import { ApplicantDialog, ApplicantLink } from "./ApplicantDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { EventScreen } from "./EventScreen";
import { eventContext, formatPublishedAt } from "./eventFormat";
import { readEventAreas } from "./eventLocalState";
import { AttendanceBar, SlotHeadcount, SlotHeader, SlotLegend } from "./GroupAttendance";
import {
  ANY,
  ATTENDANCE_LABEL,
  EMPTY_FILTERS,
  attendanceCounts,
  cohortSummary,
  filterOptions,
  genderSummary,
  groupName,
  hasAnswerFilter,
  matchesAnswers,
  matchesFilters,
  membersOf,
  nextGroupName,
  type AssignmentFilter,
  type GroupFilters,
} from "./groupBoardView";
import { OperatorShell } from "./OperatorShell";
import { participantLabel } from "./participantLabel";
import "./EventGroups.css";

type Notice = { tone: "success" | "info" | "error"; text: string };

/** The publish confirmation (#302). `unassigned` is set after 409 CONFIRMATION_REQUIRED; `stale` after a version conflict. */
type Publishing = { unassigned: number | null; stale: boolean };

/** One row of the "아무것도 저장하지 않았어요" report after a 409 CONCURRENT_MODIFICATION. */
type ConflictReport = {
  toGroupId: string | null;
  toName: string;
  items: { participantId: string; label: string; seenName: string; currentGroupId: string | null }[];
};

/**
 * 조 편성 (#301, DEC-072). Layout follows Figma P16-26 (1325:5129): page head with the 배정·미배정 chip,
 * 행사 홈 and one primary button (left for 공개, #302), group cards four at a time with 이전/다음, member
 * row cards, and the 미배정 card strip below ("이름을 눌러 배정"). The board is the working copy: every
 * change is saved at once and is not shown to participants until it is published. Moving people is
 * pick-then-send (press names, then "이 조로 보내기" or the bar at the bottom), so keyboard and touch work
 * without drag and drop. Each move sends what this screen saw (`fromGroupId`); if anyone changed in
 * between, nothing is saved, the board is read again and the differences are listed. Attendance shows
 * the ATTENDANCE tag and, when the board has 참석 칸 (#315), a bar per person and 시간대별 인원 (GroupAttendance, #318).
 * 공개 (#302) is the primary button: a confirmation shows what goes out (people whose group changes, groups
 * changed, 미배정) and what participants see, then sends the board version this screen shows. Copy is a draft.
 */
export function EventGroups() {
  const { eventId = "" } = useParams();
  return (
    <EventScreen eventId={eventId}>{(event, spaceName) => <GroupsBody event={event} spaceName={spaceName} />}</EventScreen>
  );
}

function GroupsBody({ event, spaceName }: { event: EventDetail; spaceName?: string }) {
  const eventId = event.eventId;
  const eventHref = `/events/${eventId}`;
  const board = useQuery({
    queryKey: queryKeys.groupBoard(eventId),
    queryFn: ({ signal }) => getGroupBoard(eventId, signal),
    retry: (count, error) => !(isApiError(error) && error.status < 500) && count < 2,
  });
  const me = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  const permissions = useQuery({
    queryKey: queryKeys.permissions(eventId, me.data?.userId ?? ""),
    queryFn: () => getMyPermissions(eventId, me.data!.userId),
    enabled: Boolean(me.data?.userId),
    retry: false,
  });
  const mayWrite = permissions.data?.effective.includes("GROUP_WRITE") ?? false;
  const context = [eventContext(event), spaceName ?? ""].filter((part) => part.length > 0).join(" · ");

  return (
    <OperatorShell
      title={event.name}
      spaceName={spaceName}
      eventName={event.name}
      eventHref={eventHref}
      eventAreas={readEventAreas(eventId)}
      participantsHref={`${eventHref}/participants`}
      tasksHref={`${eventHref}/tasks`}
      framed
      leading={
        <Link className="event-home__back" to={eventHref} aria-label="행사 홈으로">
          <img src={arrowLeft} alt="" />
        </Link>
      }
    >
      <div className="event-groups">
        {board.data ? (
          <Board
            eventId={eventId}
            eventHref={eventHref}
            context={context}
            board={board.data}
            fetching={board.isFetching}
            mayWrite={mayWrite}
            permissionsPending={permissions.isPending && Boolean(me.data?.userId)}
          />
        ) : (
          <>
            <PageHead context={context} eventHref={eventHref} chip={null} primary={null} />
            {isApiError(board.error) && board.error.status === 403 ? (
              <p className="event-groups__blocked" role="note">
                조 편성을 볼 권한이 없어요. 행사 OWNER에게 조 편성 권한을 요청해 주세요.
              </p>
            ) : board.isError ? (
              <div className="event-groups__inline-error">
                <p>편성판을 불러오지 못했어요.</p>
                <Button type="button" variant="secondary" size={40} onClick={() => void reloadQuery(board)}>
                  다시 시도
                </Button>
              </div>
            ) : (
              <p className="event-groups__muted">편성판을 불러오는 중이에요.</p>
            )}
          </>
        )}
      </div>
      <ApplicantDialog eventId={eventId} />
    </OperatorShell>
  );
}

function PageHead({
  context,
  eventHref,
  chip,
  primary,
}: {
  context: string;
  eventHref: string;
  chip: ReactNode;
  primary: ReactNode;
}) {
  return (
    <section className="event-groups__head" aria-label="편성 현황">
      <div className="event-groups__head-text">
        <h2 className="event-groups__title">조 편성</h2>
        {context ? <p className="event-groups__context">{context}</p> : null}
      </div>
      <div className="event-groups__head-actions">
        {chip}
        <Link className="scene-button scene-button--secondary scene-button--size-40 event-groups__home" to={eventHref}>
          <span className="scene-button__label">행사 홈</span>
        </Link>
        {/* Figma의 주 버튼 자리("변경 영향 확인")에 공개를 둔다. 영향은 공개 확인 창에서 보여 준다. */}
        <div className="event-groups__primary-slot" data-slot="publish">
          {primary}
        </div>
      </div>
    </section>
  );
}

const PAGE_QUERIES = [
  { query: "(min-width: 1200px)", size: 4 },
  { query: "(min-width: 720px)", size: 2 },
];

function subscribeWidth(callback: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const lists = PAGE_QUERIES.map((item) => window.matchMedia(item.query));
  for (const list of lists) list.addEventListener("change", callback);
  return () => {
    for (const list of lists) list.removeEventListener("change", callback);
  };
}

/** Groups per carousel page: 4 on desktop as in the design, 2 on tablets, 1 on phones. jsdom has no matchMedia: 4. */
function usePageSize(): number {
  return useSyncExternalStore(subscribeWidth, () => {
    if (typeof window.matchMedia !== "function") return 4;
    return PAGE_QUERIES.find((item) => window.matchMedia(item.query).matches)?.size ?? 1;
  });
}

function Board({
  eventId,
  eventHref,
  context,
  board,
  fetching,
  mayWrite,
  permissionsPending,
}: {
  eventId: string;
  eventHref: string;
  context: string;
  board: GroupBoard;
  fetching: boolean;
  mayWrite: boolean;
  permissionsPending: boolean;
}) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<GroupFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [target, setTarget] = useState<string>("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [conflict, setConflict] = useState<ConflictReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Group | null>(null);
  const [publishing, setPublishing] = useState<Publishing | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = usePageSize();

  const blocked = blockedReason(board.eventStatus, mayWrite, permissionsPending);
  const editable = !blocked && mayWrite;
  const people = board.participants;
  const byId = new Map(people.map((person) => [person.participantId, person]));
  const chosen = [...selected].filter((id) => byId.has(id));
  const options = filterOptions(people);
  const pool = people.filter((person) => matchesFilters(person, filters));
  const dimming = hasAnswerFilter(filters);
  const assigned = people.filter((person) => person.groupId !== null).length;

  const pages = Math.max(1, Math.ceil(board.groups.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = board.groups.slice(current * pageSize, current * pageSize + pageSize);
  const shownIds = new Set(shown.map((group) => group.groupId));
  const hiddenGroups = board.groups.length - shown.length;
  const hiddenAssigned = people.filter((person) => person.groupId !== null && !shownIds.has(person.groupId)).length;

  // A new group is added at the end; show the page it landed on.
  const [groupCount, setGroupCount] = useState(board.groups.length);
  if (board.groups.length !== groupCount) {
    if (board.groups.length > groupCount) setPage(Math.floor((board.groups.length - 1) / pageSize));
    setGroupCount(board.groups.length);
  }

  function reload() {
    return queryClient.invalidateQueries({ queryKey: queryKeys.groupBoard(eventId) });
  }

  function toggle(participantId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(participantId)) next.delete(participantId);
      else next.add(participantId);
      return next;
    });
  }

  function selectAll(ids: string[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  /** Runs a write, reads the board again, then shows the outcome, so the message never runs ahead of the board. */
  async function write(action: () => Promise<string | Notice | null>, failure: (error: unknown) => string) {
    setBusy(true);
    setNotice(null);
    setConflict(null);
    let outcome: Notice | null = null;
    try {
      const done = await action();
      if (done) outcome = typeof done === "string" ? { tone: "success", text: done } : done;
    } catch (error) {
      if (isApiError(error, "EVENT_ENDED", "EVENT_ARCHIVED")) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.event(eventId) });
      }
      if (isApiError(error, "FORBIDDEN")) {
        void queryClient.invalidateQueries({ queryKey: ["events", eventId, "operators"] });
      }
      outcome = { tone: "error", text: commonFailure(error) ?? failure(error) };
    }
    await reload();
    setNotice(outcome);
    setBusy(false);
  }

  async function move(toGroupId: string | null, ids: string[]) {
    const movers = ids.filter((id) => byId.has(id) && byId.get(id)!.groupId !== toGroupId);
    if (movers.length === 0) {
      setNotice({ tone: "info", text: "이미 그 조에 있어요." });
      return;
    }
    if (movers.length > ASSIGNMENT_CHANGES_MAX) {
      setNotice({ tone: "error", text: `한 번에 ${ASSIGNMENT_CHANGES_MAX}명까지 옮길 수 있어요.` });
      return;
    }
    const toName = groupName(board.groups, toGroupId);
    const seen = new Map(movers.map((id) => [id, byId.get(id)!.groupId]));
    const seenNames = new Map(board.groups.map((group) => [group.groupId, group.name]));
    setBusy(true);
    setNotice(null);
    setConflict(null);
    let show: () => void;
    try {
      const result = await assignParticipants(
        eventId,
        movers.map((participantId) => ({ participantId, fromGroupId: seen.get(participantId) ?? null, toGroupId })),
      );
      setSelected(new Set());
      show = () => setNotice({
        tone: "success",
        text:
          toGroupId === null
            ? `${movers.length}명을 미배정으로 뺐어요.`
            : `${movers.length}명을 ${toName}로 보냈어요.${result.alreadyApplied > 0 ? ` ${result.alreadyApplied}명은 이미 그 조에 있었어요.` : ""}`,
      });
    } catch (error) {
      const conflicts = assignmentConflicts(error);
      if (conflicts.length > 0) {
        const report: ConflictReport = {
          toGroupId,
          toName,
          items: conflicts.map((item) => {
            const from = seen.get(item.participantId) ?? null;
            const person = byId.get(item.participantId);
            return {
              participantId: item.participantId,
              label: person ? participantLabel(person) : "참가자",
              seenName: from === null ? "미배정" : (seenNames.get(from) ?? "지워진 조"),
              currentGroupId: item.currentGroupId,
            };
          }),
        };
        show = () => setConflict(report);
      } else if (isApiError(error, "INVALID_STATE_TRANSITION") && problemReason(error) === "APPLICATION_NOT_SUBMITTED") {
        const names = problemParticipantIds(error)
          .map((id) => byId.get(id))
          .filter((person): person is BoardParticipant => Boolean(person))
          .map(participantLabel);
        setSelected((current) => new Set([...current].filter((id) => !problemParticipantIds(error).includes(id))));
        show = () => setNotice({
          tone: "error",
          text: `신청을 철회한 사람이 있어 아무것도 저장하지 않았어요.${names.length > 0 ? ` (${names.join(", ")})` : ""} 그 사람을 빼고 다시 보내 주세요.`,
        });
      } else {
        if (isApiError(error, "EVENT_ENDED", "EVENT_ARCHIVED")) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.event(eventId) });
        }
        show = () => setNotice({ tone: "error", text: commonFailure(error) ?? "옮기지 못했어요. 편성판을 다시 불러왔어요." });
      }
    }
    await reload();
    show();
    setBusy(false);
  }

  function create(submit: FormEvent) {
    submit.preventDefault();
    const name = newName.trim() || nextGroupName(board.groups);
    if ([...name].length > GROUP_NAME_MAX) {
      setNotice({ tone: "error", text: `조 이름은 ${GROUP_NAME_MAX}자까지예요.` });
      return;
    }
    void write(
      async () => {
        const result = await createGroup(eventId, name);
        setNewName("");
        return `${result.group.name}를 만들었어요.`;
      },
      (error) =>
        isApiError(error, "CONFLICT")
          ? board.groups.length >= 100
            ? "조는 100개까지 만들 수 있어요."
            : "같은 이름의 조가 있어요. 다른 이름을 써 주세요."
          : "조를 만들지 못했어요.",
    );
  }

  function rename(group: Group, name: string) {
    const trimmed = name.trim();
    if (trimmed.length === 0 || [...trimmed].length > GROUP_NAME_MAX) {
      setNotice({ tone: "error", text: `조 이름은 1–${GROUP_NAME_MAX}자로 써 주세요.` });
      return;
    }
    void write(
      async () => {
        await renameGroup(eventId, group.groupId, trimmed, group.version);
        setRenaming(null);
        return trimmed === group.name ? null : `이름을 ${trimmed}로 바꿨어요.`;
      },
      (error) =>
        isApiError(error, "CONFLICT")
          ? "같은 이름의 조가 있어요. 다른 이름을 써 주세요."
          : isApiError(error, "CONCURRENT_MODIFICATION")
            ? "다른 운영자가 이 조를 먼저 바꿔서 저장하지 않았어요. 최신 상태를 불러왔으니 다시 확인해 주세요."
            : "이름을 바꾸지 못했어요.",
    );
  }

  function remove(group: Group) {
    void write(
      async () => {
        const result = await deleteGroup(eventId, group.groupId, group.version);
        setDeleting(null);
        return result.unassignedCount > 0
          ? `${group.name}를 지웠어요. ${result.unassignedCount}명이 미배정이 됐어요.`
          : `${group.name}를 지웠어요.`;
      },
      (error) => {
        setDeleting(null);
        return isApiError(error, "CONCURRENT_MODIFICATION")
          ? "다른 운영자가 이 조를 먼저 바꿔서 지우지 않았어요. 최신 상태를 확인하고 다시 지워 주세요."
          : isApiError(error, "RESOURCE_NOT_FOUND")
            ? "이미 지워진 조예요."
            : "조를 지우지 못했어요.";
      },
    );
  }

  function shift(group: Group, by: -1 | 1) {
    const ids = board.groups.map((item) => item.groupId);
    const from = ids.indexOf(group.groupId);
    const to = from + by;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    void write(
      async () => {
        await reorderGroups(eventId, ids);
        return null;
      },
      (error) =>
        isApiError(error, "CONFLICT")
          ? "다른 운영자가 조를 바꿔서 순서를 저장하지 않았어요. 최신 순서를 불러왔어요."
          : "순서를 바꾸지 못했어요.",
    );
  }

  function toggleLeader(group: Group, person: BoardParticipant) {
    const current = people.filter((item) => item.groupId === group.groupId && item.leader).map((item) => item.participantId);
    const next = person.leader ? current.filter((id) => id !== person.participantId) : [...current, person.participantId];
    void write(
      async () => {
        await setGroupLeaders(eventId, group.groupId, next, group.version);
        return person.leader
          ? `${participantLabel(person)}의 조장 표시를 뺐어요.`
          : `${participantLabel(person)}을 ${group.name} 조장으로 정했어요.`;
      },
      (error) =>
        isApiError(error, "CONCURRENT_MODIFICATION")
          ? "다른 운영자가 이 조를 먼저 바꿔서 저장하지 않았어요. 최신 상태를 불러왔으니 다시 확인해 주세요."
          : isApiError(error, "CONFLICT") && problemReason(error) === "LEADER_NOT_MEMBER"
            ? "조장은 그 조의 조원만 될 수 있어요. 그사이 조를 옮긴 사람이 있어 저장하지 않았어요."
            : isApiError(error, "VALIDATION_FAILED")
              ? `조장은 조마다 ${GROUP_LEADERS_MAX}명까지예요.`
              : "조장을 바꾸지 못했어요.",
    );
  }

  /**
   * Sends the version this screen shows. CONFIRMATION_REQUIRED and a version conflict keep the dialog open
   * (the board is read again first); anything else closes it and reports through write().
   */
  function publish(confirmUnassigned: boolean) {
    const expected = board.boardVersion;
    void write(
      async () => {
        try {
          const result = await publishGroups(eventId, expected, confirmUnassigned);
          setPublishing(null);
          if (result.result === "ALREADY_PUBLISHED") {
            return { tone: "info", text: "참가자에게 보이는 조 편성과 같아서 새로 공개하지 않았어요." };
          }
          return `참가자에게 공개했어요. 조가 바뀐 사람 ${result.changedParticipantCount.toLocaleString("ko-KR")}명${
            result.unassignedCount > 0 ? ` · 미배정 ${result.unassignedCount.toLocaleString("ko-KR")}명` : ""
          }`;
        } catch (error) {
          if (isApiError(error, "CONFIRMATION_REQUIRED")) {
            setPublishing({ unassigned: problemCount(error, "unassignedCount") ?? board.publication.unassignedCount, stale: false });
            return null;
          }
          if (isApiError(error, "CONCURRENT_MODIFICATION")) {
            setPublishing({ unassigned: null, stale: true });
            return null;
          }
          setPublishing(null);
          throw error;
        }
      },
      () => "공개하지 못했어요. 편성판을 다시 불러왔어요.",
    );
  }

  const targetId = target && board.groups.some((group) => group.groupId === target) ? target : "";
  const rangeText =
    board.groups.length === 0
      ? "아직 조가 없어요"
      : `전체 ${board.groups.length}조 중 ${
          shown.length === 1 ? current * pageSize + 1 : `${current * pageSize + 1}–${current * pageSize + shown.length}`
        }조${
          hiddenGroups > 0 ? ` · 나머지 ${hiddenGroups}조에 ${hiddenAssigned}명 배정` : ""
        }`;

  function onCarouselKey(key: KeyboardEvent<HTMLElement>) {
    if (key.target !== key.currentTarget) return;
    if (key.key === "ArrowRight" && current < pages - 1) setPage(current + 1);
    if (key.key === "ArrowLeft" && current > 0) setPage(current - 1);
  }

  return (
    <>
      <PageHead
        context={context}
        eventHref={eventHref}
        chip={
          <p className="event-groups__chip" aria-live="polite">
            배정 {assigned.toLocaleString("ko-KR")} · 미배정 {(people.length - assigned).toLocaleString("ko-KR")}
          </p>
        }
        primary={
          <Button
            type="button"
            variant="primary"
            size={40}
            disabled={!editable || busy}
            aria-describedby={blocked ? "groups-blocked" : undefined}
            onClick={() => {
              setNotice(null);
              setPublishing({ unassigned: null, stale: false });
            }}
          >
            참가자에게 공개
          </Button>
        }
      />
      <p className="event-groups__hint">
        바꾼 내용은 바로 저장되지만, 참가자에게는 공개해야 보여요.{" "}
        <span className="event-groups__published">{publishedText(board)}</span>
        {board.publication.hasUnpublishedChanges ? (
          <span className="event-groups__unpublished"> 참가자에게 아직 공개하지 않은 변경이 있어요.</span>
        ) : null}
        {fetching ? <span className="event-groups__fetching"> 최신 상태를 확인하는 중…</span> : null}
      </p>

      {blocked ? (
        <p className="event-groups__blocked" id="groups-blocked" role="note">
          {blocked}
        </p>
      ) : null}

      <div className="event-groups__notice-slot" aria-live="polite">
        {notice ? (
          <p className={`event-groups__notice event-groups__notice--${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
            {notice.text}
          </p>
        ) : null}
        {conflict ? (
          <ConflictPanel
            report={conflict}
            groups={board.groups}
            busy={busy}
            editable={editable}
            onRetry={() => void move(conflict.toGroupId, chosen)}
            onClose={() => setConflict(null)}
          />
        ) : null}
      </div>

      <section
        className="event-groups__board"
        aria-labelledby="groups-board-title"
        aria-roledescription="carousel"
        tabIndex={-1}
        onKeyDown={onCarouselKey}
      >
        <div className="event-groups__board-head">
          <h2 id="groups-board-title" className="event-groups__range">
            {rangeText}
          </h2>
          <div className="event-groups__board-tools">
            {board.groups.length > pageSize ? (
              <div className="event-groups__pager" role="group" aria-label="조 넘겨 보기">
                <Button
                  type="button"
                  variant="secondary"
                  size={32}
                  disabled={current === 0}
                  aria-label="이전 조"
                  onClick={() => setPage(current - 1)}
                >
                  ‹
                </Button>
                <span className="event-groups__pager-page" aria-live="polite">
                  {current + 1} / {pages}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size={32}
                  disabled={current >= pages - 1}
                  aria-label="다음 조"
                  onClick={() => setPage(current + 1)}
                >
                  ›
                </Button>
              </div>
            ) : null}
            {editable ? (
              <form className="event-groups__create" onSubmit={create}>
                <label className="event-groups__visually-hidden" htmlFor="groups-new-name">
                  새 조 이름
                </label>
                <input
                  id="groups-new-name"
                  className="event-groups__input"
                  value={newName}
                  maxLength={GROUP_NAME_MAX}
                  placeholder={nextGroupName(board.groups)}
                  onChange={(change) => setNewName(change.target.value)}
                />
                <Button type="submit" variant="secondary" size={32} disabled={busy}>
                  + 조 추가
                </Button>
              </form>
            ) : null}
          </div>
        </div>
        {board.groups.length > 0 ? <SlotLegend slots={board.slots} /> : null}
        {board.groups.length === 0 ? (
          <p className="event-groups__empty">
            {editable ? "아직 조가 없어요. 오른쪽 위에서 조를 추가해 주세요." : "아직 만든 조가 없어요."}
          </p>
        ) : (
          <ol className="event-groups__grid" style={{ ["--groups-per-page" as string]: pageSize }}>
            {shown.map((group) => {
              const index = board.groups.indexOf(group);
              return (
                <li key={group.groupId}>
                  <GroupCard
                    group={group}
                    slots={board.slots}
                    members={membersOf(people, group.groupId)}
                    genderOrder={options.gender}
                    first={index === 0}
                    last={index === board.groups.length - 1}
                    editable={editable}
                    busy={busy}
                    selected={selected}
                    chosenCount={chosen.filter((id) => byId.get(id)?.groupId !== group.groupId).length}
                    dim={(person) => dimming && !matchesAnswers(person, filters)}
                    renaming={renaming === group.groupId}
                    onToggle={toggle}
                    onSend={() => void move(group.groupId, chosen)}
                    onRenameStart={() => setRenaming(group.groupId)}
                    onRenameCancel={() => setRenaming(null)}
                    onRename={(name) => rename(group, name)}
                    onShift={(by) => {
                      shift(group, by);
                      const moved = index + by;
                      if (Math.floor(moved / pageSize) !== current) setPage(Math.floor(moved / pageSize));
                    }}
                    onDelete={() => setDeleting(group)}
                    onLeader={(person) => toggleLeader(group, person)}
                  />
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="event-groups__pool" aria-labelledby="groups-pool-title">
        <div className="event-groups__pool-head">
          <h2 id="groups-pool-title" className="event-groups__pool-title">
            {poolTitle(filters.assignment)} <span className="event-groups__pool-count">{pool.length.toLocaleString("ko-KR")}명</span>
          </h2>
          {editable ? <span className="event-groups__pool-hint">이름을 눌러 고른 뒤 조로 보내요</span> : null}
          {editable && pool.length > 0 ? (
            <label className="event-groups__check-all">
              <input
                type="checkbox"
                checked={pool.every((person) => selected.has(person.participantId))}
                onChange={(change) => selectAll(pool.map((person) => person.participantId), change.target.checked)}
              />
              보이는 사람 모두 고르기
            </label>
          ) : null}
        </div>
        <Filters filters={filters} options={options} onChange={setFilters} />
        {pool.length === 0 ? (
          <p className="event-groups__muted">{poolEmpty(filters, people.length)}</p>
        ) : (
          <ul className="event-groups__people" aria-label={poolTitle(filters.assignment)}>
            {pool.map((person) => (
              <li key={person.participantId}>
                <PoolCard
                  person={person}
                  slots={board.slots}
                  groups={board.groups}
                  showGroup={filters.assignment !== "unassigned"}
                  selectable={editable}
                  checked={selected.has(person.participantId)}
                  onToggle={() => toggle(person.participantId)}
                />
              </li>
            ))}
          </ul>
        )}
        {board.withdrawn.length > 0 ? (
          <div className="event-groups__withdrawn">
            <h3 className="event-groups__subtitle">철회됨 · 이전 조 {board.withdrawn.length}명</h3>
            <p className="event-groups__muted">신청을 철회해 조별 인원에서 빠진 사람이에요. 다른 조로는 옮길 수 없어요.</p>
            <ul className="event-groups__withdrawn-list" aria-label="철회됨">
              {board.withdrawn.map((person) => (
                <li key={person.participantId} className="event-groups__withdrawn-row">
                  <span>
                    {person.name}
                    <span className="event-groups__meta"> · 이전 조 {groupName(board.groups, person.groupId)}</span>
                  </span>
                  {editable && person.groupId !== null ? (
                    <Button
                      type="button"
                      variant="tertiary"
                      size={32}
                      disabled={busy}
                      aria-label={`${person.name} 미배정으로 빼기`}
                      onClick={() =>
                        void write(
                          async () => {
                            await assignParticipants(eventId, [
                              { participantId: person.participantId, fromGroupId: person.groupId, toGroupId: null },
                            ]);
                            return `${person.name}을 이전 조에서 뺐어요.`;
                          },
                          (error) =>
                            assignmentConflicts(error).length > 0
                              ? "다른 운영자가 먼저 바꿔서 저장하지 않았어요. 최신 상태를 불러왔어요."
                              : "빼지 못했어요.",
                        )
                      }
                    >
                      미배정으로 빼기
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {editable && chosen.length > 0 ? (
        <div className="event-groups__bar" role="region" aria-label="고른 사람 옮기기">
          <p className="event-groups__bar-count">{chosen.length}명 골랐어요</p>
          <label className="event-groups__visually-hidden" htmlFor="groups-target">
            보낼 조
          </label>
          <select
            id="groups-target"
            className="event-groups__select"
            value={targetId}
            onChange={(change) => setTarget(change.target.value)}
          >
            <option value="">보낼 조 고르기</option>
            {board.groups.map((group) => (
              <option key={group.groupId} value={group.groupId}>
                {group.name}
              </option>
            ))}
          </select>
          <Button type="button" variant="primary" size={40} disabled={busy || !targetId} onClick={() => void move(targetId, chosen)}>
            보내기
          </Button>
          <Button
            type="button"
            variant="secondary"
            size={40}
            disabled={busy || chosen.every((id) => byId.get(id)?.groupId === null)}
            onClick={() => void move(null, chosen)}
          >
            미배정으로 빼기
          </Button>
          <Button type="button" variant="tertiary" size={40} onClick={() => setSelected(new Set())}>
            선택 해제
          </Button>
        </div>
      ) : null}

      {publishing ? (
        <PublishDialog
          board={board}
          state={publishing}
          busy={busy}
          onCancel={() => setPublishing(null)}
          onConfirm={() => publish(publishing.unassigned !== null)}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`${deleting.name}를 지울까요?`}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button type="button" variant="secondary" size={40} onClick={() => setDeleting(null)}>
                취소
              </Button>
              <Button type="button" variant="danger" size={40} loading={busy} onClick={() => remove(deleting)}>
                지우기
              </Button>
            </>
          }
        >
          <p>
            {(() => {
              const count = people.filter((person) => person.groupId === deleting.groupId).length;
              return count > 0 ? `조원 ${count}명은 미배정이 되고 조장 표시도 풀려요.` : "조원이 없는 조예요.";
            })()}{" "}
            이미 공개한 편성은 다시 공개하기 전까지 그대로 보여요.
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

function Filters({
  filters,
  options,
  onChange,
}: {
  filters: GroupFilters;
  options: ReturnType<typeof filterOptions>;
  onChange: (filters: GroupFilters) => void;
}) {
  const set = (patch: Partial<GroupFilters>) => onChange({ ...filters, ...patch });
  const active =
    filters.q.trim().length > 0 ||
    [filters.gender, filters.cohort, filters.attendance, filters.middleGroup, filters.cell, filters.newcomer].some(
      (value) => value !== ANY,
    ) ||
    filters.assignment !== "unassigned";
  return (
    <div className="event-groups__filters" role="group" aria-label="참가자 거르기">
      <label className="event-groups__field event-groups__field--search">
        <span className="event-groups__field-label">이름 검색</span>
        <input
          className="event-groups__input"
          type="search"
          value={filters.q}
          placeholder="예: 김하늘, 94"
          autoComplete="off"
          onChange={(change) => set({ q: change.target.value })}
        />
      </label>
      <FilterSelect label="배정 상태" value={filters.assignment} onChange={(value) => set({ assignment: value as AssignmentFilter })}>
        <option value="unassigned">미배정</option>
        <option value="assigned">배정됨</option>
        <option value="all">전체</option>
      </FilterSelect>
      <AnswerSelect label="성별" value={filters.gender} options={options.gender} onChange={(gender) => set({ gender })} />
      <AnswerSelect label="또래" value={filters.cohort} options={options.cohort} onChange={(cohort) => set({ cohort })} />
      <AnswerSelect
        label="참석 방식"
        value={filters.attendance}
        options={options.attendance}
        onChange={(attendance) => set({ attendance })}
      />
      <AnswerSelect
        label="중그룹"
        value={filters.middleGroup}
        options={options.middleGroup}
        onChange={(middleGroup) => set({ middleGroup })}
      />
      <AnswerSelect label="셀" value={filters.cell} options={options.cell} onChange={(cell) => set({ cell })} />
      <AnswerSelect label="새가족" value={filters.newcomer} options={options.newcomer} onChange={(newcomer) => set({ newcomer })} />
      {active ? (
        <Button type="button" variant="tertiary" size={40} onClick={() => onChange(EMPTY_FILTERS)}>
          초기화
        </Button>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="event-groups__field">
      <span className="event-groups__field-label">{label}</span>
      <select className="event-groups__select" value={value} onChange={(change) => onChange(change.target.value)}>
        {children}
      </select>
    </label>
  );
}

function AnswerSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; count: number }[];
  onChange: (value: string) => void;
}) {
  return (
    <FilterSelect label={label} value={value} onChange={onChange}>
      <option value={ANY}>전체</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label} ({option.count})
        </option>
      ))}
    </FilterSelect>
  );
}

function AttendanceTag({ person }: { person: BoardParticipant }) {
  return (
    <>
      <span className={`event-groups__tag event-groups__tag--${person.attendance.toLowerCase()}`}>
        {ATTENDANCE_LABEL[person.attendance]}
      </span>
      {person.newcomer ? <span className="event-groups__newcomer">새가족</span> : null}
    </>
  );
}

/** One card in the 미배정 strip (Figma "Unassigned card"). Pressing the name picks the person. */
function PoolCard({
  person,
  slots,
  groups,
  showGroup,
  selectable,
  checked,
  onToggle,
}: {
  person: BoardParticipant;
  slots: AttendanceSlot[] | null;
  groups: Group[];
  showGroup: boolean;
  selectable: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const label = participantLabel(person);
  const meta = [person.gender?.label, person.middleGroup, person.cell, showGroup ? groupName(groups, person.groupId) : null].filter(
    Boolean,
  );
  const body = (
    <>
      <span className="event-groups__card-name">
        {selectable ? (
          <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`${label} 고르기`} />
        ) : null}
        <ApplicantLink className="event-groups__name" applicationId={person.applicationId} label={`${label} 신청 내용`}>
          {label}
        </ApplicantLink>
      </span>
      <AttendanceBar slots={slots} person={person} />
      <span className="event-groups__pool-meta">
        <AttendanceTag person={person} />
        {meta.length > 0 ? <span className="event-groups__meta">{meta.join(" · ")}</span> : null}
      </span>
    </>
  );
  if (!selectable) return <div className="event-groups__pool-card">{body}</div>;
  return (
    <label className={`event-groups__pool-card event-groups__pool-card--selectable${checked ? " event-groups__pool-card--checked" : ""}`}>
      {body}
    </label>
  );
}

function GroupCard({
  group,
  slots,
  members,
  genderOrder,
  first,
  last,
  editable,
  busy,
  selected,
  chosenCount,
  dim,
  renaming,
  onToggle,
  onSend,
  onRenameStart,
  onRenameCancel,
  onRename,
  onShift,
  onDelete,
  onLeader,
}: {
  group: Group;
  slots: AttendanceSlot[] | null;
  members: BoardParticipant[];
  genderOrder: { value: string; label: string; count: number }[];
  first: boolean;
  last: boolean;
  editable: boolean;
  busy: boolean;
  selected: ReadonlySet<string>;
  chosenCount: number;
  dim: (person: BoardParticipant) => boolean;
  renaming: boolean;
  onToggle: (participantId: string) => void;
  onSend: () => void;
  onRenameStart: () => void;
  onRenameCancel: () => void;
  onRename: (name: string) => void;
  onShift: (by: -1 | 1) => void;
  onDelete: () => void;
  onLeader: (person: BoardParticipant) => void;
}) {
  const [draft, setDraft] = useState(group.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const leaders = members.filter((person) => person.leader).length;
  const gender = genderSummary(members, genderOrder);
  const cohort = cohortSummary(members);
  const attendance = attendanceCounts(members);
  const headingId = `group-${group.groupId}`;
  return (
    <article className="event-groups__card" aria-labelledby={headingId}>
      <header className="event-groups__card-head">
        <div className="event-groups__card-title-row">
          <h3 id={headingId} className="event-groups__card-title">
            {group.name}
          </h3>
          <span className="event-groups__card-size">{members.length}명</span>
          {editable && !renaming ? (
            <button
              type="button"
              className="event-groups__menu-button"
              aria-label={`${group.name} 조 메뉴`}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              •••
            </button>
          ) : null}
        </div>
        {gender ? <p className="event-groups__card-gender">{gender}</p> : null}
        {attendance.length > 0 || cohort ? (
          <div className="event-groups__card-pills">
            {attendance.map((item) => (
              <span key={item.value} className={`event-groups__pill event-groups__pill--${item.value.toLowerCase()}`}>
                {item.label} {item.count}
              </span>
            ))}
          </div>
        ) : null}
        {cohort ? <p className="event-groups__card-dist">또래 {cohort}</p> : null}
        {renaming ? (
          <form
            className="event-groups__rename"
            onSubmit={(submit) => {
              submit.preventDefault();
              onRename(draft);
            }}
          >
            <label className="event-groups__visually-hidden" htmlFor={`${headingId}-name`}>
              {group.name} 새 이름
            </label>
            <input
              id={`${headingId}-name`}
              className="event-groups__input"
              value={draft}
              maxLength={GROUP_NAME_MAX}
              autoFocus
              onChange={(change) => setDraft(change.target.value)}
              onKeyDown={(key) => {
                if (key.key === "Escape") onRenameCancel();
              }}
            />
            <Button type="submit" variant="primary" size={32} disabled={busy}>
              저장
            </Button>
            <Button type="button" variant="tertiary" size={32} onClick={onRenameCancel}>
              취소
            </Button>
          </form>
        ) : null}
        {editable && menuOpen && !renaming ? (
          <div className="event-groups__card-actions" role="group" aria-label={`${group.name} 조 관리`}>
            <Button
              type="button"
              variant="tertiary"
              size={32}
              disabled={busy}
              onClick={() => {
                setDraft(group.name);
                setMenuOpen(false);
                onRenameStart();
              }}
              aria-label={`${group.name} 이름 바꾸기`}
            >
              이름
            </Button>
            <Button type="button" variant="tertiary" size={32} disabled={busy || first} onClick={() => onShift(-1)} aria-label={`${group.name} 앞으로`}>
              앞으로
            </Button>
            <Button type="button" variant="tertiary" size={32} disabled={busy || last} onClick={() => onShift(1)} aria-label={`${group.name} 뒤로`}>
              뒤로
            </Button>
            <Button
              type="button"
              variant="tertiary"
              size={32}
              disabled={busy}
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
              aria-label={`${group.name} 지우기`}
            >
              삭제
            </Button>
          </div>
        ) : null}
      </header>
      {members.length === 0 ? (
        <p className="event-groups__card-empty">아직 조원이 없어요.</p>
      ) : (
        <>
        <SlotHeader slots={slots} />
        <ul className="event-groups__members" aria-label={`${group.name} 조원`}>
          {members.map((person) => {
            const label = participantLabel(person);
            const checked = selected.has(person.participantId);
            return (
              <li
                key={person.participantId}
                className={`event-groups__member${dim(person) ? " event-groups__member--dim" : ""}${checked ? " event-groups__member--checked" : ""}`}
              >
                <span className="event-groups__member-main">
                  {editable ? (
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(person.participantId)}
                      aria-label={`${label} 고르기`}
                    />
                  ) : null}
                  <ApplicantLink className="event-groups__name" applicationId={person.applicationId} label={`${label} 신청 내용`}>
                    {label}
                  </ApplicantLink>
                  {person.leader ? <span className="event-groups__leader">조장</span> : null}
                  <AttendanceTag person={person} />
                  {editable ? (
                    <button
                      type="button"
                      className="event-groups__leader-toggle"
                      aria-pressed={person.leader}
                      disabled={busy || (!person.leader && leaders >= GROUP_LEADERS_MAX)}
                      title={!person.leader && leaders >= GROUP_LEADERS_MAX ? `조장은 ${GROUP_LEADERS_MAX}명까지예요` : undefined}
                      aria-label={person.leader ? `${label} 조장 해제` : `${label} 조장으로 정하기`}
                      onClick={() => onLeader(person)}
                    >
                      {person.leader ? "조장 해제" : "조장"}
                    </button>
                  ) : null}
                </span>
                <AttendanceBar slots={slots} person={person} />
              </li>
            );
          })}
        </ul>
        </>
      )}
      <SlotHeadcount slots={slots} members={members} />
      {editable && chosenCount > 0 ? (
        <Button type="button" variant="secondary" size={40} className="event-groups__send" disabled={busy} onClick={onSend}>
          고른 {chosenCount}명 이 조로 보내기
        </Button>
      ) : null}
    </article>
  );
}

/** Figma 1325:5581 shape: title, one line of context, a tinted box of what changes, 취소 · primary. */
function PublishDialog({
  board,
  state,
  busy,
  onCancel,
  onConfirm,
}: {
  board: GroupBoard;
  state: Publishing;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const publication = board.publication;
  const first = publication.lastPublishedAt === null;
  const unchanged = !first && !publication.hasUnpublishedChanges;
  const count = (value: number) => value.toLocaleString("ko-KR");
  const unassigned = state.unassigned ?? publication.unassignedCount;
  return (
    <ConfirmDialog
      title={state.unassigned !== null ? `미배정 ${count(unassigned)}명을 두고 공개할까요?` : "참가자에게 조 편성을 공개할까요?"}
      onClose={onCancel}
      footer={
        <>
          <Button type="button" variant="secondary" size={40} onClick={onCancel}>
            취소
          </Button>
          <Button type="button" variant="primary" size={40} loading={busy} onClick={onConfirm}>
            {state.unassigned !== null ? "미배정 두고 공개" : "공개"}
          </Button>
        </>
      }
    >
      {state.stale ? (
        <p className="event-groups__publish-stale" role="alert">
          그사이 편성판이 바뀌어 공개하지 않았어요. 최신 편성판을 불러왔으니 아래 내용을 다시 확인해 주세요.
        </p>
      ) : null}
      {state.unassigned !== null ? (
        <p>
          아직 조가 없는 참가자 {count(unassigned)}명은 내 조 화면에서 &ldquo;아직 조가 정해지지 않았어요&rdquo;로 보여요. 나중에
          배정하고 다시 공개할 수 있어요.
        </p>
      ) : (
        <p>
          참가자는 자기 링크에서 조 이름과 조장 이름을 봐요. 조장은 자기 조원의 이름과 또래를 더 봐요. 연락처는 보이지 않아요.
        </p>
      )}
      <div className="event-groups__publish-box">
        <p className="event-groups__publish-box-title">{first ? "처음 공개" : unchanged ? "바뀐 내용 없음" : "이번에 바뀌는 내용"}</p>
        <ul className="event-groups__publish-list" aria-label="공개되는 내용">
          <li>조가 바뀌는 사람 {count(publication.changedParticipantCount)}명</li>
          <li>바뀐 조 {count(publication.groupChanges)}개</li>
          <li>미배정 {count(unassigned)}명</li>
        </ul>
        {unchanged ? <p className="event-groups__publish-box-note">지금 참가자에게 보이는 조 편성과 같아요.</p> : null}
      </div>
    </ConfirmDialog>
  );
}

function publishedText(board: GroupBoard): string {
  const { lastPublishedAt, lastPublishedByDisplayName } = board.publication;
  if (!lastPublishedAt) return "아직 공개하지 않았어요.";
  const at = formatPublishedAt(lastPublishedAt);
  return `마지막 공개 ${at}${lastPublishedByDisplayName ? ` · ${lastPublishedByDisplayName}` : ""}.`;
}

function ConflictPanel({
  report,
  groups,
  busy,
  editable,
  onRetry,
  onClose,
}: {
  report: ConflictReport;
  groups: Group[];
  busy: boolean;
  editable: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div className="event-groups__conflict" role="alert">
      <p className="event-groups__conflict-title">
        다른 운영자가 먼저 바꾼 사람이 있어 아무것도 저장하지 않았어요. 최신 편성판을 다시 불러왔어요.
      </p>
      <ul className="event-groups__conflict-list" aria-label="먼저 바뀐 사람">
        {report.items.map((item) => (
          <li key={item.participantId}>
            <strong>{item.label}</strong> — 내가 본 조 {item.seenName} → 지금 {groupName(groups, item.currentGroupId)}
          </li>
        ))}
      </ul>
      <p className="event-groups__muted">
        {report.toGroupId === null ? "미배정으로 빼기" : `${report.toName}로 보내기`}를 최신 상태로 다시 하려면 아래를 눌러 주세요.
      </p>
      <div className="event-groups__conflict-actions">
        {editable ? (
          <Button type="button" variant="primary" size={40} disabled={busy} onClick={onRetry}>
            최신 상태로 다시 보내기
          </Button>
        ) : null}
        <Button type="button" variant="tertiary" size={40} onClick={onClose}>
          닫기
        </Button>
      </div>
    </div>
  );
}

function blockedReason(status: LifecycleStatus, mayWrite: boolean, permissionsPending: boolean): string | null {
  if (status === "ENDED") return "종료된 행사라 조 편성을 바꿀 수 없어요. 편성판은 볼 수 있어요.";
  if (status === "ARCHIVED") return "보관된 행사라 조 편성을 바꿀 수 없어요. 편성판은 읽기 전용이에요.";
  if (permissionsPending) return null;
  if (!mayWrite) return "조 편성 권한이 없어 편성판만 볼 수 있어요. 행사 OWNER에게 권한을 요청해 주세요.";
  return null;
}

function commonFailure(error: unknown): string | null {
  if (isApiError(error, "EVENT_ENDED")) return "종료된 행사라 저장하지 않았어요.";
  if (isApiError(error, "EVENT_ARCHIVED")) return "보관된 행사라 저장하지 않았어요.";
  if (isApiError(error, "FORBIDDEN")) return "조 편성 권한이 없어 저장하지 않았어요.";
  if (isApiError(error, "NETWORK_ERROR", "UNEXPECTED") || (isApiError(error) && error.status >= 500)) {
    return "결과를 확인하지 못했어요. 편성판을 다시 불러왔으니 반영됐는지 확인해 주세요.";
  }
  return null;
}

function poolTitle(assignment: AssignmentFilter): string {
  if (assignment === "unassigned") return "미배정 참가자";
  if (assignment === "assigned") return "배정된 참가자";
  return "참가자";
}

function poolEmpty(filters: GroupFilters, total: number): string {
  if (total === 0) return "아직 신청한 참가자가 없어요.";
  if (filters.assignment === "unassigned" && !hasAnswerFilter(filters)) return "모두 조에 배정했어요.";
  return "조건에 맞는 참가자가 없어요.";
}
