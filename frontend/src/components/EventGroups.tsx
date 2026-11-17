import { useState, type FormEvent, type ReactNode } from "react";
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
  problemParticipantIds,
  problemReason,
  renameGroup,
  reorderGroups,
  setGroupLeaders,
  type BoardParticipant,
  type Group,
  type GroupBoard,
} from "../api/groups";
import { getMyPermissions } from "../api/operators";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { getMe } from "../api/session";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { EventScreen } from "./EventScreen";
import { readEventAreas } from "./eventLocalState";
import {
  ANY,
  ATTENDANCE_LABEL,
  EMPTY_FILTERS,
  attendanceSummary,
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

/** One row of the "아무것도 저장하지 않았어요" report after a 409 CONCURRENT_MODIFICATION. */
type ConflictReport = {
  toGroupId: string | null;
  toName: string;
  items: { participantId: string; label: string; seenName: string; currentGroupId: string | null }[];
};

/**
 * 조 편성 (#301, DEC-072). The board is the working copy: every change is saved at once and is not shown
 * to participants until it is published (#302, not here). Moving people is pick-then-send (checkboxes and
 * "이 조로 보내기" or the bar at the bottom), so keyboard and touch work without drag and drop. Each move
 * sends what this screen saw (`fromGroupId`); if anyone changed in between, nothing is saved, the board is
 * read again and the differences are listed. Copy is a draft.
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

  return (
    <OperatorShell
      title="조 편성"
      spaceName={spaceName}
      eventName={event.name}
      eventHref={eventHref}
      eventAreas={readEventAreas(eventId)}
      participantsHref={`${eventHref}/participants`}
      tasksHref={`${eventHref}/tasks`}
      framed
      leading={
        <Link className="event-home__back" to={eventHref} aria-label="행사 홈">
          <img src={arrowLeft} alt="" />
        </Link>
      }
    >
      <div className="event-groups">
        {board.data ? (
          <Board
            eventId={eventId}
            board={board.data}
            fetching={board.isFetching}
            mayWrite={mayWrite}
            permissionsPending={permissions.isPending && Boolean(me.data?.userId)}
          />
        ) : isApiError(board.error) && board.error.status === 403 ? (
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
      </div>
    </OperatorShell>
  );
}

function Board({
  eventId,
  board,
  fetching,
  mayWrite,
  permissionsPending,
}: {
  eventId: string;
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

  const blocked = blockedReason(board.eventStatus, mayWrite, permissionsPending);
  const editable = !blocked && mayWrite;
  const people = board.participants;
  const byId = new Map(people.map((person) => [person.participantId, person]));
  const chosen = [...selected].filter((id) => byId.has(id));
  const options = filterOptions(people);
  const pool = people.filter((person) => matchesFilters(person, filters));
  const dimming = hasAnswerFilter(filters);
  const assigned = people.filter((person) => person.groupId !== null).length;

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

  async function write(action: () => Promise<string | null>, failure: (error: unknown) => string) {
    setBusy(true);
    setNotice(null);
    setConflict(null);
    try {
      const done = await action();
      if (done) setNotice({ tone: "success", text: done });
    } catch (error) {
      if (isApiError(error, "EVENT_ENDED", "EVENT_ARCHIVED")) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.event(eventId) });
      }
      if (isApiError(error, "FORBIDDEN")) {
        void queryClient.invalidateQueries({ queryKey: ["events", eventId, "operators"] });
      }
      setNotice({ tone: "error", text: commonFailure(error) ?? failure(error) });
    } finally {
      await reload();
      setBusy(false);
    }
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
    try {
      const result = await assignParticipants(
        eventId,
        movers.map((participantId) => ({ participantId, fromGroupId: seen.get(participantId) ?? null, toGroupId })),
      );
      setSelected(new Set());
      setNotice({
        tone: "success",
        text:
          toGroupId === null
            ? `${movers.length}명을 미배정으로 뺐어요.`
            : `${movers.length}명을 ${toName}로 보냈어요.${result.alreadyApplied > 0 ? ` ${result.alreadyApplied}명은 이미 그 조에 있었어요.` : ""}`,
      });
    } catch (error) {
      const conflicts = assignmentConflicts(error);
      if (conflicts.length > 0) {
        setConflict({
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
        });
      } else if (isApiError(error, "INVALID_STATE_TRANSITION") && problemReason(error) === "APPLICATION_NOT_SUBMITTED") {
        const names = problemParticipantIds(error)
          .map((id) => byId.get(id))
          .filter((person): person is BoardParticipant => Boolean(person))
          .map(participantLabel);
        setSelected((current) => new Set([...current].filter((id) => !problemParticipantIds(error).includes(id))));
        setNotice({
          tone: "error",
          text: `신청을 철회한 사람이 있어 아무것도 저장하지 않았어요.${names.length > 0 ? ` (${names.join(", ")})` : ""} 그 사람을 빼고 다시 보내 주세요.`,
        });
      } else {
        if (isApiError(error, "EVENT_ENDED", "EVENT_ARCHIVED")) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.event(eventId) });
        }
        setNotice({ tone: "error", text: commonFailure(error) ?? "옮기지 못했어요. 편성판을 다시 불러왔어요." });
      }
    } finally {
      await reload();
      setBusy(false);
    }
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

  const targetId = target && board.groups.some((group) => group.groupId === target) ? target : "";

  return (
    <>
      <section className="event-groups__top" aria-label="편성 현황">
        <p className="event-groups__summary">
          전체 {people.length.toLocaleString("ko-KR")} · 배정 {assigned.toLocaleString("ko-KR")} · 미배정{" "}
          {(people.length - assigned).toLocaleString("ko-KR")}
          <span className="event-groups__summary-groups"> · 조 {board.groups.length}개</span>
        </p>
        {board.publication.hasUnpublishedChanges ? (
          <span className="event-groups__chip">참가자에게 아직 공개하지 않은 변경이 있어요</span>
        ) : null}
        {/* #302: 공개 버튼과 확인 창은 이 자리에 들어온다. */}
        <div className="event-groups__publish-slot" data-slot="publish" />
      </section>
      <p className="event-groups__hint">
        바꾼 내용은 바로 저장되지만, 참가자에게는 공개해야 보여요.
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

      <Toolbar
        filters={filters}
        options={options}
        onChange={(next) => setFilters(next)}
        create={
          editable ? (
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
              <Button type="submit" variant="secondary" size={40} disabled={busy}>
                + 조 추가
              </Button>
            </form>
          ) : null
        }
      />

      <div className="event-groups__layout">
        <section className="event-groups__pool" aria-labelledby="groups-pool-title">
          <div className="event-groups__pool-head">
            <h2 id="groups-pool-title" className="event-groups__section-title">
              {poolTitle(filters.assignment)} {pool.length.toLocaleString("ko-KR")}명
            </h2>
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
          {pool.length === 0 ? (
            <p className="event-groups__muted">{poolEmpty(filters, people.length)}</p>
          ) : (
            <ul className="event-groups__people" aria-label={poolTitle(filters.assignment)}>
              {pool.map((person) => (
                <li key={person.participantId}>
                  <PersonRow
                    person={person}
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
              <ul className="event-groups__people" aria-label="철회됨">
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

        <section className="event-groups__board" aria-labelledby="groups-board-title">
          <h2 id="groups-board-title" className="event-groups__visually-hidden">
            조 목록
          </h2>
          {board.groups.length === 0 ? (
            <p className="event-groups__empty">
              {editable ? "아직 조가 없어요. 위에서 조를 추가해 주세요." : "아직 만든 조가 없어요."}
            </p>
          ) : (
            <ol className="event-groups__grid">
              {board.groups.map((group, index) => (
                <li key={group.groupId}>
                  <GroupCard
                    group={group}
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
                    onShift={(by) => shift(group, by)}
                    onDelete={() => setDeleting(group)}
                    onLeader={(person) => toggleLeader(group, person)}
                  />
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

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

function Toolbar({
  filters,
  options,
  onChange,
  create,
}: {
  filters: GroupFilters;
  options: ReturnType<typeof filterOptions>;
  onChange: (filters: GroupFilters) => void;
  create: ReactNode;
}) {
  const set = (patch: Partial<GroupFilters>) => onChange({ ...filters, ...patch });
  const active =
    filters.q.trim().length > 0 ||
    [filters.gender, filters.cohort, filters.attendance, filters.middleGroup, filters.cell].some((value) => value !== ANY) ||
    filters.assignment !== "unassigned";
  return (
    <div className="event-groups__toolbar">
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
        {active ? (
          <Button type="button" variant="tertiary" size={40} onClick={() => onChange(EMPTY_FILTERS)}>
            초기화
          </Button>
        ) : null}
      </div>
      {create}
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

function PersonRow({
  person,
  groups,
  showGroup,
  selectable,
  checked,
  onToggle,
}: {
  person: BoardParticipant;
  groups: Group[];
  showGroup: boolean;
  selectable: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const label = participantLabel(person);
  const meta = [
    person.gender?.label,
    person.middleGroup,
    person.cell,
    showGroup ? groupName(groups, person.groupId) : null,
  ].filter(Boolean);
  const body = (
    <>
      <span className="event-groups__name">{label}</span>
      {person.attendance !== "FULL" ? (
        <span className={`event-groups__badge event-groups__badge--${person.attendance.toLowerCase()}`}>
          {ATTENDANCE_LABEL[person.attendance]}
        </span>
      ) : null}
      <span className="event-groups__meta">{meta.join(" · ")}</span>
    </>
  );
  if (!selectable) return <div className="event-groups__person">{body}</div>;
  return (
    <label className={`event-groups__person event-groups__person--selectable${checked ? " event-groups__person--checked" : ""}`}>
      <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`${label} 고르기`} />
      {body}
    </label>
  );
}

function GroupCard({
  group,
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
  const leaders = members.filter((person) => person.leader).length;
  const gender = genderSummary(members, genderOrder);
  const cohort = cohortSummary(members);
  const attendance = attendanceSummary(members);
  const headingId = `group-${group.groupId}`;
  return (
    <article className="event-groups__card" aria-labelledby={headingId}>
      <header className="event-groups__card-head">
        <h3 id={headingId} className="event-groups__card-title">
          {group.name}
        </h3>
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
        <p className="event-groups__card-count">
          {members.length}명{gender ? ` · ${gender}` : ""}
        </p>
        {cohort ? <p className="event-groups__card-dist">또래 {cohort}</p> : null}
        {attendance ? <p className="event-groups__card-dist">{attendance}</p> : null}
        {editable && !renaming ? (
          <div className="event-groups__card-actions">
            <Button
              type="button"
              variant="tertiary"
              size={32}
              disabled={busy}
              onClick={() => {
                setDraft(group.name);
                onRenameStart();
              }}
              aria-label={`${group.name} 이름 바꾸기`}
            >
              이름
            </Button>
            <Button type="button" variant="tertiary" size={32} disabled={busy || first} onClick={() => onShift(-1)} aria-label={`${group.name} 앞으로`}>
              ↑
            </Button>
            <Button type="button" variant="tertiary" size={32} disabled={busy || last} onClick={() => onShift(1)} aria-label={`${group.name} 뒤로`}>
              ↓
            </Button>
            <Button type="button" variant="tertiary" size={32} disabled={busy} onClick={onDelete} aria-label={`${group.name} 지우기`}>
              삭제
            </Button>
          </div>
        ) : null}
      </header>
      {members.length === 0 ? (
        <p className="event-groups__card-empty">아직 조원이 없어요.</p>
      ) : (
        <ul className="event-groups__members" aria-label={`${group.name} 조원`}>
          {members.map((person) => {
            const label = participantLabel(person);
            const checked = selected.has(person.participantId);
            return (
              <li
                key={person.participantId}
                className={`event-groups__member${dim(person) ? " event-groups__member--dim" : ""}${checked ? " event-groups__member--checked" : ""}`}
              >
                {editable ? (
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(person.participantId)}
                    aria-label={`${label} 고르기`}
                  />
                ) : null}
                <span className="event-groups__name">{label}</span>
                {person.leader ? <span className="event-groups__leader">조장</span> : null}
                {person.attendance !== "FULL" ? (
                  <span className={`event-groups__badge event-groups__badge--${person.attendance.toLowerCase()}`}>
                    {ATTENDANCE_LABEL[person.attendance]}
                  </span>
                ) : null}
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
              </li>
            );
          })}
        </ul>
      )}
      {editable && chosenCount > 0 ? (
        <Button type="button" variant="secondary" size={40} className="event-groups__send" disabled={busy} onClick={onSend}>
          고른 {chosenCount}명 이 조로 보내기
        </Button>
      ) : null}
    </article>
  );
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
