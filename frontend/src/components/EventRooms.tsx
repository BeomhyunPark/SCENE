import { useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import arrowLeft from "../assets/event-create/arrow-left.svg";
import { isApiError } from "../api/errors";
import type { EventDetail, LifecycleStatus } from "../api/events";
import { getGroupBoard } from "../api/groups";
import { getMyPermissions } from "../api/operators";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import {
  ROOM_CAPACITY_MAX,
  ROOM_CHANGES_MAX,
  ROOM_LOCATION_MAX,
  ROOM_NAME_MAX,
  ROOMS_MAX,
  assignRooms,
  confirmRoomReview,
  createRoom,
  deleteRoom,
  getParticipantSettings,
  getRoomBoard,
  problemIds,
  publishRooms,
  reorderRooms,
  roomConflicts,
  updateRoom,
  updateRoomRosterScope,
  type Room,
  type RoomBoard,
  type RoomFields,
  type RoomParticipant,
  type RoomRosterScope,
} from "../api/rooms";
import { getMe } from "../api/session";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { EventScreen } from "./EventScreen";
import { eventContext, formatPublishedAt } from "./eventFormat";
import { readEventAreas } from "./eventLocalState";
import { AttendanceBar, SlotLegend } from "./GroupAttendance";
import { ATTENDANCE_LABEL } from "./groupBoardView";
import type { DropTarget } from "./groupDrop";
import { OperatorShell } from "./OperatorShell";
import { participantLabel } from "./participantLabel";
import {
  ANY,
  EMPTY_ROOM_FILTERS,
  LODGING_LABEL,
  REVIEW_LABEL,
  ROSTER_SCOPE_LABEL,
  filterOptions,
  genderTone,
  groupMembers,
  hasAnswerFilter,
  matchesAnswers,
  matchesFilters,
  membersOfRoom,
  nextRoomName,
  nightsText,
  numberedRoomNames,
  planRoomMove,
  roomName,
  warningSummary,
  warningText,
  type RoomAssignmentFilter,
  type RoomFilters,
} from "./roomBoardView";
import { useBoardDrag, type DragOver } from "./useBoardDrag";
import "./EventGroups.css";
import "./EventRooms.css";

type Notice = { tone: "success" | "info" | "error"; text: string };
type Publishing = { unassigned: number | null; notLodging: number | null; stale: boolean; notify: boolean };
type GenderOption = { value: string; label: string };

/**
 * 숙소 (G3 #458, DEC-085, api.md "숙소"). Same working-copy screen as 조 편성 and built from its parts (filters,
 * pick-then-send bar, pointer drag `useBoardDrag`, 참석 막대, confirm dialogs): room cards with 정원·성별 구분·위치 메모 and
 * the server's warnings, the 미배정 list below, and 공개 on the primary button. People move by drag and drop (onto a
 * room card, or onto the list to unassign) or by picking names and sending them; 조 단위 일괄 배정 builds one
 * request from a group's members. Nobody who does not sleep over can go in a room (the screen leaves them out and
 * says so; the server refuses with NOT_LODGING). "다시 볼 것" (A11 #461) lists people whose 숙박·참석·성별 changed since
 * they were placed; 확인 keeps the room and clears the mark. Capacity and gender never block; publishing asks again
 * only for 미배정 and for people left in a room who no longer sleep over. Copy is a draft.
 */
export function EventRooms() {
  const { eventId = "" } = useParams();
  return <EventScreen eventId={eventId}>{(event, spaceName) => <RoomsBody event={event} spaceName={spaceName} />}</EventScreen>;
}

function RoomsBody({ event, spaceName }: { event: EventDetail; spaceName?: string }) {
  const eventId = event.eventId;
  const eventHref = `/events/${eventId}`;
  const board = useQuery({
    queryKey: queryKeys.roomBoard(eventId),
    queryFn: ({ signal }) => getRoomBoard(eventId, signal),
    retry: (count, error) => !(isApiError(error) && error.status < 500) && count < 2,
  });
  const me = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  const permissions = useQuery({
    queryKey: queryKeys.permissions(eventId, me.data?.userId ?? ""),
    queryFn: () => getMyPermissions(eventId, me.data!.userId),
    enabled: Boolean(me.data?.userId),
    retry: false,
  });
  const effective = permissions.data?.effective ?? [];
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
      <div className="event-groups event-rooms">
        {board.data ? (
          <Board
            eventId={eventId}
            eventHref={eventHref}
            context={context}
            board={board.data}
            fetching={board.isFetching}
            mayWrite={effective.includes("ROOM_WRITE")}
            maySetScope={effective.includes("EVENT_UPDATE")}
            permissionsPending={permissions.isPending && Boolean(me.data?.userId)}
          />
        ) : (
          <>
            <PageHead context={context} eventHref={eventHref} chip={null} primary={null} />
            {isApiError(board.error) && board.error.status === 403 ? (
              <p className="event-groups__blocked" role="note">
                숙소 배정판을 볼 권한이 없어요. 행사 OWNER에게 숙소 권한을 요청해 주세요.
              </p>
            ) : board.isError ? (
              <div className="event-groups__inline-error">
                <p>숙소 배정판을 불러오지 못했어요.</p>
                <Button type="button" variant="secondary" size={40} onClick={() => void reloadQuery(board)}>
                  다시 시도
                </Button>
              </div>
            ) : (
              <p className="event-groups__muted">숙소 배정판을 불러오는 중이에요.</p>
            )}
          </>
        )}
      </div>
    </OperatorShell>
  );
}

function PageHead({ context, eventHref, chip, primary }: { context: string; eventHref: string; chip: ReactNode; primary: ReactNode }) {
  return (
    <section className="event-groups__head" aria-label="숙소 현황">
      <div className="event-groups__head-text">
        <h2 className="event-groups__title">숙소</h2>
        {context ? <p className="event-groups__context">{context}</p> : null}
      </div>
      <div className="event-groups__head-actions">
        {chip}
        <Link className="scene-button scene-button--secondary scene-button--size-40 event-groups__home" to={eventHref}>
          <span className="scene-button__label">행사 홈</span>
        </Link>
        <div className="event-groups__primary-slot">{primary}</div>
      </div>
    </section>
  );
}

function Board({
  eventId,
  eventHref,
  context,
  board,
  fetching,
  mayWrite,
  maySetScope,
  permissionsPending,
}: {
  eventId: string;
  eventHref: string;
  context: string;
  board: RoomBoard;
  fetching: boolean;
  mayWrite: boolean;
  maySetScope: boolean;
  permissionsPending: boolean;
}) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<RoomFilters>(EMPTY_ROOM_FILTERS);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [target, setTarget] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Room | null>(null);
  const [publishing, setPublishing] = useState<Publishing | null>(null);
  const [adding, setAdding] = useState(false);

  const blocked = blockedReason(board.eventStatus, mayWrite, permissionsPending);
  const editable = !blocked && mayWrite;
  const people = board.participants;
  const byId = new Map(people.map((person) => [person.participantId, person]));
  const chosen = [...selected].filter((id) => byId.has(id));
  const options = filterOptions(board);
  const genderOptions = roomGenderOptions(board);
  const pool = people.filter((person) => matchesFilters(person, filters));
  const dimming = hasAnswerFilter(filters);
  const reviews = people.filter((person) => person.review !== null);
  const notLodging = people.filter((person) => person.lodging === "NOT_LODGING");
  const assigned = board.publication.assignedCount;

  function reload() {
    return queryClient.invalidateQueries({ queryKey: queryKeys.roomBoard(eventId) });
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

  /** Runs a write, reads the board again, then shows the outcome so the message never runs ahead of the board. */
  async function write(action: () => Promise<string | Notice | null>, failure: (error: unknown) => string) {
    setBusy(true);
    setNotice(null);
    let outcome: Notice | null = null;
    try {
      const done = await action();
      if (done) outcome = typeof done === "string" ? { tone: "success", text: done } : done;
    } catch (error) {
      if (isApiError(error, "EVENT_ENDED", "EVENT_ARCHIVED")) void queryClient.invalidateQueries({ queryKey: queryKeys.event(eventId) });
      if (isApiError(error, "FORBIDDEN")) void queryClient.invalidateQueries({ queryKey: ["events", eventId, "operators"] });
      outcome = { tone: "error", text: commonFailure(error) ?? failure(error) };
    }
    await reload();
    setNotice(outcome);
    setBusy(false);
  }

  /**
   * Puts `ids` in `toRoomId` (null takes them out) in one request. People who do not sleep over are left out of a
   * move into a room before sending; if the server still refuses some (their answer changed meanwhile), nothing is
   * saved and they are named.
   */
  function move(toRoomId: string | null, ids: string[], label?: string) {
    const { changes, notLodging: skipped } = planRoomMove(people, ids, toRoomId);
    const skippedText =
      skipped.length > 0
        ? ` 숙박하지 않는 ${skipped.length}명(${skipped.map(participantLabel).join(", ")})은 방에 넣을 수 없어 뺐어요.`
        : "";
    if (changes.length === 0) {
      setNotice(
        skipped.length > 0
          ? { tone: "error", text: `숙박하지 않는 사람은 방에 넣을 수 없어요.${skippedText}` }
          : { tone: "info", text: toRoomId === null ? "이미 미배정이에요." : "이미 그 방에 있어요." },
      );
      return;
    }
    if (changes.length > ROOM_CHANGES_MAX) {
      setNotice({ tone: "error", text: `한 번에 ${ROOM_CHANGES_MAX}명까지 옮길 수 있어요.` });
      return;
    }
    const toName = roomName(board.rooms, toRoomId);
    void write(
      async () => {
        const result = await assignRooms(eventId, changes);
        setSelected(new Set());
        const who = label ?? `${result.changed}명`;
        const base = toRoomId === null ? `${who}을 미배정으로 뺐어요.` : `${who}을 ${toName}에 넣었어요.`;
        const already = result.alreadyApplied > 0 ? ` ${result.alreadyApplied}명은 이미 그 방에 있었어요.` : "";
        const warned = warningSummary(board.rooms, result.rooms.filter((room) => room.roomId === toRoomId));
        return { tone: warned ? "info" : "success", text: `${base}${already}${skippedText}${warned}` };
      },
      (error) => {
        if (isApiError(error, "INVALID_STATE_TRANSITION")) {
          const ids = problemIds(error);
          const names = ids.map((id) => byId.get(id)).filter((person): person is RoomParticipant => Boolean(person));
          setSelected((current) => new Set([...current].filter((id) => !ids.includes(id))));
          const list = names.length > 0 ? ` (${names.map(participantLabel).join(", ")})` : "";
          return error.extensions.reason === "NOT_LODGING"
            ? `숙박하지 않는 사람이 있어 아무것도 저장하지 않았어요${list}. 그사이 신청이 바뀐 것 같아요. 그 사람을 빼고 다시 보내 주세요.`
            : `신청을 취소한 사람이 있어 아무것도 저장하지 않았어요${list}. 그 사람을 빼고 다시 보내 주세요.`;
        }
        const conflicts = roomConflicts(error);
        if (conflicts.length > 0) {
          const names = conflicts
            .map((item) => {
              const person = byId.get(item.participantId);
              return person ? `${participantLabel(person)}(지금 ${roomName(board.rooms, item.currentRoomId)})` : null;
            })
            .filter(Boolean);
          return `다른 운영자가 먼저 옮긴 사람이 있어 아무것도 저장하지 않았어요: ${names.join(", ")}. 최신 배정판을 불러왔으니 다시 보내 주세요.`;
        }
        if (isApiError(error, "RESOURCE_NOT_FOUND")) return "그사이 지워진 방이 있어 저장하지 않았어요. 최신 배정판을 불러왔어요.";
        return "옮기지 못했어요. 배정판을 다시 불러왔어요.";
      },
    );
  }

  function confirmReview(ids: string[], label: string) {
    void write(
      async () => {
        const result = await confirmRoomReview(eventId, ids);
        return result.confirmed > 0 ? `${label} 확인했어요. 방은 그대로예요.` : { tone: "info", text: "이미 확인한 내용이에요." };
      },
      () => "확인하지 못했어요. 배정판을 다시 불러왔어요.",
    );
  }

  function saveRoom(room: Room | null, fields: RoomFields): Promise<boolean> {
    let ok = false;
    return write(
      async () => {
        if (room) {
          await updateRoom(eventId, room.roomId, fields, room.version);
          setEditing(null);
          ok = true;
          return `${fields.name ?? room.name}을 고쳤어요.`;
        }
        const result = await createRoom(eventId, fields);
        ok = true;
        return `${result.room.name}을 만들었어요.`;
      },
      (error) => roomWriteFailure(error, board.rooms.length),
    ).then(() => ok);
  }

  function createMany(names: string[], fields: Omit<RoomFields, "name">): Promise<boolean> {
    let ok = false;
    return write(
      async () => {
        if (board.rooms.length + names.length > ROOMS_MAX) {
          return { tone: "error", text: `방은 ${ROOMS_MAX}개까지예요. 지금 ${board.rooms.length}개가 있어요.` };
        }
        const taken = new Set(board.rooms.map((room) => room.name));
        let made = 0;
        const skipped: string[] = [];
        for (const name of names) {
          if (taken.has(name)) {
            skipped.push(name);
            continue;
          }
          try {
            await createRoom(eventId, { ...fields, name });
            made += 1;
          } catch (error) {
            if (isApiError(error, "CONFLICT") && error.extensions.reason !== "ROOM_LIMIT") {
              skipped.push(name);
              continue;
            }
            throw Object.assign(error as object, { made });
          }
        }
        ok = made > 0;
        return {
          tone: skipped.length > 0 ? "info" : "success",
          text: `방 ${made}개를 만들었어요.${skipped.length > 0 ? ` 같은 이름이 있어 ${skipped.join(", ")}은 건너뛰었어요.` : ""}`,
        };
      },
      (error) => {
        const made = (error as { made?: number }).made ?? 0;
        return `${made > 0 ? `방 ${made}개를 만든 뒤 ` : ""}${roomWriteFailure(error, board.rooms.length)}`;
      },
    ).then(() => ok);
  }

  function remove(room: Room) {
    void write(
      async () => {
        const result = await deleteRoom(eventId, room.roomId, room.version);
        setDeleting(null);
        return result.unassignedCount > 0 ? `${room.name}을 지웠어요. ${result.unassignedCount}명이 미배정이 됐어요.` : `${room.name}을 지웠어요.`;
      },
      (error) => {
        setDeleting(null);
        return isApiError(error, "CONCURRENT_MODIFICATION")
          ? "다른 운영자가 이 방을 먼저 고쳐서 지우지 않았어요. 최신 상태를 확인하고 다시 지워 주세요."
          : isApiError(error, "RESOURCE_NOT_FOUND")
            ? "이미 지워진 방이에요."
            : "방을 지우지 못했어요.";
      },
    );
  }

  function shift(room: Room, by: -1 | 1) {
    const ids = board.rooms.map((item) => item.roomId);
    const from = ids.indexOf(room.roomId);
    const to = from + by;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    void write(
      async () => {
        await reorderRooms(eventId, ids);
        return null;
      },
      (error) => (isApiError(error, "CONFLICT") ? "다른 운영자가 방을 바꿔서 순서를 저장하지 않았어요. 최신 순서를 불러왔어요." : "순서를 바꾸지 못했어요."),
    );
  }

  /** Sends the version this screen shows; CONFIRMATION_REQUIRED and a version conflict keep the dialog open. */
  function publish(state: Publishing) {
    const expected = board.boardVersion;
    void write(
      async () => {
        try {
          const result = await publishRooms(eventId, {
            expectedBoardVersion: expected,
            confirmUnassigned: state.unassigned !== null,
            confirmNotLodging: state.notLodging !== null,
            notify: state.notify,
          });
          setPublishing(null);
          if (result.result === "ALREADY_PUBLISHED") {
            return { tone: "info", text: "참가자에게 보이는 숙소 배정과 같아서 새로 공개하지 않았어요." };
          }
          const parts = [`방이 바뀐 사람 ${count(result.changedParticipantCount)}명`];
          if (result.unassignedCount > 0) parts.push(`미배정 ${count(result.unassignedCount)}명`);
          if (result.roomsWithWarnings > 0) parts.push(`경고가 있는 방 ${count(result.roomsWithWarnings)}개`);
          parts.push(state.notify ? `알림 ${count(result.notifiedCount)}명` : "알림 보내지 않음");
          return `참가자에게 숙소를 공개했어요. ${parts.join(" · ")}`;
        } catch (error) {
          if (isApiError(error, "CONFIRMATION_REQUIRED")) {
            const unassigned = extensionCount(error, "unassignedCount");
            const notLodgingCount = extensionCount(error, "notLodgingAssignedCount");
            setPublishing({
              ...state,
              unassigned: unassigned > 0 ? unassigned : null,
              notLodging: notLodgingCount > 0 ? notLodgingCount : null,
              stale: false,
            });
            return null;
          }
          if (isApiError(error, "CONCURRENT_MODIFICATION")) {
            setPublishing({ ...state, unassigned: null, notLodging: null, stale: true });
            return null;
          }
          setPublishing(null);
          throw error;
        }
      },
      () => "공개하지 못했어요. 배정판을 다시 불러왔어요.",
    );
  }

  function dropPeople(ids: string[], drop: DropTarget) {
    if (!editable || busy) return;
    move(drop.kind === "pool" ? null : drop.groupId, ids, ids.length === 1 && byId.has(ids[0]) ? participantLabel(byId.get(ids[0])!) : undefined);
  }

  const { drag, start } = useBoardDrag({ onDropPeople: dropPeople, onDropGroup: () => {}, onPage: () => {} });
  const over = drag?.over ?? null;

  function startPerson(event: ReactPointerEvent<HTMLElement>, person: RoomParticipant, fromGrip: boolean) {
    if (!editable || busy || person.lodging === "NOT_LODGING" && person.roomId === null) return;
    const ids = selected.has(person.participantId) ? chosen : [person.participantId];
    const label = ids.length === 1 ? participantLabel(person) : `${participantLabel(person)} 외 ${ids.length - 1}명`;
    start(event, { kind: "people", ids, label }, fromGrip);
  }

  const targetId = target && board.rooms.some((room) => room.roomId === target) ? target : "";

  return (
    <>
      <PageHead
        context={context}
        eventHref={eventHref}
        chip={
          <p className="event-groups__chip" aria-live="polite">
            배정 {count(assigned)} · 미배정 {count(board.publication.unassignedCount)}
            {notLodging.length > 0 ? ` · 숙박 안 함 ${count(notLodging.length)}` : ""}
          </p>
        }
        primary={
          <Button
            type="button"
            variant="primary"
            size={40}
            disabled={!editable || busy}
            aria-describedby={blocked ? "rooms-blocked" : undefined}
            onClick={() => {
              setNotice(null);
              setPublishing({ unassigned: null, notLodging: null, stale: false, notify: true });
            }}
          >
            참가자에게 공개
          </Button>
        }
      />
      <p className="event-groups__hint">
        바꾼 내용은 바로 저장되지만, 참가자에게는 공개해야 보여요. 정원·성별이 맞지 않아도 막지 않고 경고만 보여요.{" "}
        <span className="event-groups__published">{publishedText(board)}</span>
        {board.publication.hasUnpublishedChanges ? (
          <span className="event-groups__unpublished"> 참가자에게 아직 공개하지 않은 변경이 있어요.</span>
        ) : null}
        {fetching ? <span className="event-groups__fetching"> 최신 상태를 확인하는 중…</span> : null}
      </p>

      {blocked ? (
        <p className="event-groups__blocked" id="rooms-blocked" role="note">
          {blocked}
        </p>
      ) : null}

      <div className="event-groups__notice-slot" aria-live="polite">
        {notice ? (
          <p className={`event-groups__notice event-groups__notice--${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
            {notice.text}
          </p>
        ) : null}
      </div>

      {reviews.length > 0 ? (
        <ReviewPanel
          board={board}
          reviews={reviews}
          editable={editable}
          busy={busy}
          onConfirm={confirmReview}
          onTakeOut={(person) => move(null, [person.participantId], participantLabel(person))}
        />
      ) : null}

      <section className="event-groups__board" aria-labelledby="rooms-board-title">
        <div className="event-groups__board-head">
          <h2 id="rooms-board-title" className="event-groups__range">
            {board.rooms.length === 0 ? "아직 방이 없어요" : `방 ${board.rooms.length}개 · 정원 ${count(totalCapacity(board.rooms))}명`}
          </h2>
          <div className="event-groups__board-tools">
            {editable ? (
              <Button type="button" variant="secondary" size={32} disabled={busy} aria-expanded={adding} onClick={() => setAdding((open) => !open)}>
                + 방 추가
              </Button>
            ) : null}
          </div>
        </div>
        {editable && adding ? (
          <AddRooms
            rooms={board.rooms}
            genderOptions={genderOptions}
            busy={busy}
            onCreate={(fields) => saveRoom(null, fields)}
            onCreateMany={createMany}
            onClose={() => setAdding(false)}
          />
        ) : null}
        {board.rooms.length > 0 ? <SlotLegend slots={board.slots} /> : null}
        {board.rooms.length === 0 ? (
          <p className="event-groups__empty">{editable ? "아직 방이 없어요. 위의 + 방 추가로 방을 만들어 주세요." : "아직 만든 방이 없어요."}</p>
        ) : (
          <ol className="event-rooms__grid">
            {board.rooms.map((room, index) => (
              <li key={room.roomId}>
                <RoomCard
                  room={room}
                  board={board}
                  members={membersOfRoom(people, room.roomId)}
                  genderOptions={genderOptions}
                  first={index === 0}
                  last={index === board.rooms.length - 1}
                  editable={editable}
                  busy={busy}
                  editing={editing === room.roomId}
                  selected={selected}
                  chosenCount={chosen.filter((id) => byId.get(id)?.roomId !== room.roomId).length}
                  dim={(person) => dimming && !matchesAnswers(person, filters)}
                  dragging={drag?.item.kind === "people"}
                  over={over?.kind === "group" && over.groupId === room.roomId}
                  onToggle={toggle}
                  onSend={() => move(room.roomId, chosen)}
                  onEdit={() => setEditing(room.roomId)}
                  onEditCancel={() => setEditing(null)}
                  onSave={(fields) => saveRoom(room, fields)}
                  onShift={(by) => shift(room, by)}
                  onDelete={() => setDeleting(room)}
                  onStartPerson={startPerson}
                />
              </li>
            ))}
          </ol>
        )}
        {board.rooms.length > 0 ? (
          <p className="event-groups__legend">이름 칸 색: 남 파랑, 여 분홍 · ⚑ = 다시 볼 것 · 정원·성별 경고는 방 위에 보여요</p>
        ) : null}
      </section>

      {editable && board.groups.length > 0 && board.rooms.length > 0 ? (
        <GroupBatch eventId={eventId} board={board} busy={busy} onSend={(roomId, ids, label) => move(roomId, ids, label)} />
      ) : null}

      <section
        className={`event-groups__pool${drag?.item.kind === "people" ? " event-groups__pool--target" : ""}${over?.kind === "pool" ? " event-groups__pool--over" : ""}`}
        aria-labelledby="rooms-pool-title"
        data-drop="pool"
      >
        <div className="event-groups__pool-head">
          <h2 id="rooms-pool-title" className="event-groups__pool-title">
            {poolTitle(filters.assignment)} <span className="event-groups__pool-count">{count(pool.length)}명</span>
          </h2>
          {editable ? (
            <span className="event-groups__pool-hint">
              {drag?.item.kind === "people" ? "여기에 놓으면 미배정으로 빠져요" : "방으로 끌어 놓거나, 이름을 골라 방으로 보내요"}
            </span>
          ) : null}
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
        {notLodging.some((person) => person.roomId === null) && filters.lodging !== "NOT_LODGING" ? (
          <p className="event-rooms__not-lodging-note">
            숙박하지 않는 {notLodging.filter((person) => person.roomId === null).length}명(집회만·통근·당일)은 방에 넣지 않아요. 미배정 수에도 들지 않아요.{" "}
            <button type="button" className="event-rooms__link" onClick={() => setFilters({ ...filters, lodging: "NOT_LODGING", assignment: "all" })}>
              명단 보기
            </button>
          </p>
        ) : null}
        {pool.length === 0 ? (
          <p className="event-groups__muted">{poolEmpty(filters, people.length)}</p>
        ) : (
          <ul className="event-groups__people" aria-label={poolTitle(filters.assignment)}>
            {pool.map((person) => (
              <li key={person.participantId}>
                <PoolCard
                  person={person}
                  board={board}
                  genderOptions={genderOptions}
                  showRoom={filters.assignment !== "unassigned"}
                  selectable={editable}
                  checked={selected.has(person.participantId)}
                  dragging={drag?.item.kind === "people" && drag.item.ids.includes(person.participantId)}
                  onToggle={() => toggle(person.participantId)}
                  onStart={(event, fromGrip) => startPerson(event, person, fromGrip)}
                />
              </li>
            ))}
          </ul>
        )}
        {board.withdrawn.length > 0 ? (
          <div className="event-groups__withdrawn">
            <h3 className="event-groups__subtitle">신청 취소 · 방에 남은 {board.withdrawn.length}명</h3>
            <p className="event-groups__muted">신청을 취소해 방 인원에서 빠진 사람이에요. 다른 방으로는 옮길 수 없어요.</p>
            <ul className="event-groups__withdrawn-list" aria-label="신청 취소">
              {board.withdrawn.map((person) => (
                <li key={person.participantId} className="event-groups__withdrawn-row">
                  <span>
                    {person.name}
                    <span className="event-groups__meta"> · {roomName(board.rooms, person.roomId)}</span>
                  </span>
                  {editable && person.roomId !== null ? (
                    <Button
                      type="button"
                      variant="tertiary"
                      size={32}
                      disabled={busy}
                      aria-label={`${person.name} 미배정으로 빼기`}
                      onClick={() =>
                        void write(
                          async () => {
                            await assignRooms(eventId, [{ participantId: person.participantId, fromRoomId: person.roomId, toRoomId: null }]);
                            return `${person.name}을 방에서 뺐어요.`;
                          },
                          () => "빼지 못했어요.",
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

      <RosterScope eventId={eventId} maySet={maySetScope && board.eventStatus !== "ARCHIVED"} published={board.publication.lastPublishedAt !== null} />

      {editable && chosen.length > 0 ? (
        <div className="event-groups__bar" role="region" aria-label="고른 사람 옮기기">
          <p className="event-groups__bar-count">{chosen.length}명 골랐어요</p>
          <label className="event-groups__visually-hidden" htmlFor="rooms-target">
            보낼 방
          </label>
          <select id="rooms-target" className="event-groups__select" value={targetId} onChange={(change) => setTarget(change.target.value)}>
            <option value="">보낼 방 고르기</option>
            {board.rooms.map((room) => (
              <option key={room.roomId} value={room.roomId}>
                {room.name} ({room.memberCount}
                {room.capacity !== null ? `/${room.capacity}` : ""}명)
              </option>
            ))}
          </select>
          <Button type="button" variant="primary" size={40} disabled={busy || !targetId} onClick={() => move(targetId, chosen)}>
            보내기
          </Button>
          <Button
            type="button"
            variant="secondary"
            size={40}
            disabled={busy || chosen.every((id) => byId.get(id)?.roomId === null)}
            onClick={() => move(null, chosen)}
          >
            미배정으로 빼기
          </Button>
          <Button type="button" variant="tertiary" size={40} onClick={() => setSelected(new Set())}>
            선택 해제
          </Button>
        </div>
      ) : null}

      <p className="event-groups__visually-hidden" aria-live="assertive">
        {drag ? dragText(drag.item.label, over, board) : ""}
      </p>
      {drag ? (
        <div className="event-groups__ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          {drag.item.label}
        </div>
      ) : null}

      {publishing ? (
        <PublishDialog
          board={board}
          state={publishing}
          busy={busy}
          onNotify={(notify) => setPublishing({ ...publishing, notify })}
          onCancel={() => setPublishing(null)}
          onConfirm={() => publish(publishing)}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`${deleting.name}을 지울까요?`}
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
            {deleting.memberCount > 0 ? `방에 있는 ${deleting.memberCount}명은 미배정이 돼요.` : "아무도 없는 방이에요."} 이미 공개한 숙소는 다시 공개하기
            전까지 그대로 보여요.
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

function ReviewPanel({
  board,
  reviews,
  editable,
  busy,
  onConfirm,
  onTakeOut,
}: {
  board: RoomBoard;
  reviews: RoomParticipant[];
  editable: boolean;
  busy: boolean;
  onConfirm: (ids: string[], label: string) => void;
  onTakeOut: (person: RoomParticipant) => void;
}) {
  return (
    <section className="event-rooms__review" aria-labelledby="rooms-review-title">
      <div className="event-rooms__review-head">
        <h2 id="rooms-review-title" className="event-rooms__review-title">
          ⚑ 다시 볼 것 {reviews.length}명
        </h2>
        {editable && reviews.length > 1 ? (
          <Button
            type="button"
            variant="secondary"
            size={32}
            disabled={busy}
            onClick={() => onConfirm(reviews.map((person) => person.participantId), `${reviews.length}명을 모두`)}
          >
            모두 확인
          </Button>
        ) : null}
      </div>
      <p className="event-groups__muted">
        방에 넣은 뒤 신청을 고친 사람이에요. 방은 자동으로 바꾸지 않아요. 보고 그대로 두려면 확인을, 숙박을 뺀 사람은 미배정으로 빼 주세요.
      </p>
      <ul className="event-rooms__review-list" aria-label="다시 볼 사람">
        {reviews.map((person) => {
          const label = participantLabel(person);
          return (
            <li key={person.participantId} className="event-rooms__review-row">
              <span className="event-rooms__review-text">
                <strong>{label}</strong>
                <span className="event-groups__meta"> · {roomName(board.rooms, person.roomId)} · 지금 {nightsText(person)}</span>
                <span className="event-rooms__review-reasons">{person.review!.reasons.map((reason) => REVIEW_LABEL[reason]).join(" · ")}</span>
              </span>
              {editable ? (
                <span className="event-rooms__review-actions">
                  {person.lodging === "NOT_LODGING" ? (
                    <Button type="button" variant="secondary" size={32} disabled={busy} aria-label={`${label} 미배정으로 빼기`} onClick={() => onTakeOut(person)}>
                      미배정으로 빼기
                    </Button>
                  ) : null}
                  <Button type="button" variant="tertiary" size={32} disabled={busy} aria-label={`${label} 확인`} onClick={() => onConfirm([person.participantId], label)}>
                    확인
                  </Button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RoomCard({
  room,
  board,
  members,
  genderOptions,
  first,
  last,
  editable,
  busy,
  editing,
  selected,
  chosenCount,
  dim,
  dragging,
  over,
  onToggle,
  onSend,
  onEdit,
  onEditCancel,
  onSave,
  onShift,
  onDelete,
  onStartPerson,
}: {
  room: Room;
  board: RoomBoard;
  members: RoomParticipant[];
  genderOptions: GenderOption[];
  first: boolean;
  last: boolean;
  editable: boolean;
  busy: boolean;
  editing: boolean;
  selected: ReadonlySet<string>;
  chosenCount: number;
  dim: (person: RoomParticipant) => boolean;
  dragging: boolean;
  over: boolean;
  onToggle: (participantId: string) => void;
  onSend: () => void;
  onEdit: () => void;
  onEditCancel: () => void;
  onSave: (fields: RoomFields) => Promise<boolean>;
  onShift: (by: -1 | 1) => void;
  onDelete: () => void;
  onStartPerson: (event: ReactPointerEvent<HTMLElement>, person: RoomParticipant, fromGrip: boolean) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const headingId = `room-${room.roomId}`;
  const full = room.capacity !== null && room.memberCount >= room.capacity;
  const warned = room.warnings.length > 0;
  const flagged = new Set(room.warnings.flatMap((warning) => warning.participantIds ?? []));
  const cardClass = [
    "event-groups__card",
    "event-rooms__card",
    warned ? "event-rooms__card--warned" : "",
    dragging ? "event-groups__card--target" : "",
    over ? "event-groups__card--over" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <article className={cardClass} aria-labelledby={headingId} data-drop="group" data-group-id={room.roomId}>
      <header className="event-groups__card-head">
        <div className="event-groups__card-title-row">
          <h3 id={headingId} className="event-groups__card-title">
            {room.name}
          </h3>
          <span className={`event-groups__card-size${full ? " event-rooms__size--full" : ""}`}>
            {room.memberCount}
            {room.capacity !== null ? `/${room.capacity}` : ""}명
          </span>
          {editable && !editing ? (
            <button
              type="button"
              className="event-groups__menu-button"
              aria-label={`${room.name} 방 메뉴`}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              •••
            </button>
          ) : null}
        </div>
        <p className="event-groups__card-gender">
          {room.gender ? `${room.gender.label ?? "알 수 없는 보기"} 방` : "성별 구분 없음"}
          {room.capacity === null ? " · 정원 없음" : ""}
        </p>
        {room.locationNote ? <p className="event-rooms__location">{room.locationNote}</p> : null}
        {warned ? (
          <ul className="event-rooms__warnings" aria-label={`${room.name} 경고`}>
            {room.warnings.map((warning) => (
              <li key={warning.code} className={`event-rooms__warning event-rooms__warning--${warning.code.toLowerCase()}`}>
                {warningText(warning)}
              </li>
            ))}
          </ul>
        ) : null}
        {editing ? (
          <RoomForm
            idPrefix={headingId}
            label={`${room.name} 고치기`}
            initial={room}
            genderOptions={genderOptions}
            busy={busy}
            submitLabel="저장"
            onSubmit={(fields) => onSave(fields)}
            onCancel={onEditCancel}
          />
        ) : null}
        {editable && menuOpen && !editing ? (
          <div className="event-groups__card-actions" role="group" aria-label={`${room.name} 방 관리`}>
            <Button
              type="button"
              variant="tertiary"
              size={32}
              disabled={busy}
              aria-label={`${room.name} 고치기`}
              onClick={() => {
                setMenuOpen(false);
                onEdit();
              }}
            >
              고치기
            </Button>
            <Button type="button" variant="tertiary" size={32} disabled={busy || first} aria-label={`${room.name} 앞으로`} onClick={() => onShift(-1)}>
              앞으로
            </Button>
            <Button type="button" variant="tertiary" size={32} disabled={busy || last} aria-label={`${room.name} 뒤로`} onClick={() => onShift(1)}>
              뒤로
            </Button>
            <Button
              type="button"
              variant="tertiary"
              size={32}
              disabled={busy}
              aria-label={`${room.name} 지우기`}
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
            >
              삭제
            </Button>
          </div>
        ) : null}
      </header>
      {members.length === 0 ? (
        <p className="event-groups__card-empty">아직 아무도 없어요.</p>
      ) : (
        <ul className="event-rooms__members" aria-label={`${room.name} 사람`}>
          {members.map((person) => {
            const label = participantLabel(person);
            const checked = selected.has(person.participantId);
            return (
              <li
                key={person.participantId}
                className={`event-rooms__member${dim(person) ? " event-groups__member--dim" : ""}${checked ? " event-groups__member--checked" : ""}${flagged.has(person.participantId) ? " event-rooms__member--flagged" : ""}`}
                title={`${ATTENDANCE_LABEL[person.attendance]} · ${nightsText(person)}${person.gender ? ` · ${person.gender.label}` : ""}`}
                onPointerDown={(event) => onStartPerson(event, person, false)}
              >
                {editable ? (
                  <input type="checkbox" checked={checked} onChange={() => onToggle(person.participantId)} aria-label={`${label} 고르기`} />
                ) : null}
                {editable ? <Grip label={`${label} 끌어서 옮기기`} onStart={(event) => onStartPerson(event, person, true)} /> : null}
                <NamePill person={person} genderOptions={genderOptions} />
                <span className="event-rooms__member-meta">
                  {person.review ? (
                    <span className="event-rooms__flag" title="다시 볼 것">
                      ⚑<span className="event-groups__visually-hidden"> 다시 볼 것</span>
                    </span>
                  ) : null}
                  {person.lodging === "NOT_LODGING" ? <span className="event-rooms__tag event-rooms__tag--not-lodging">숙박 안 함</span> : null}
                  {person.group ? <span className="event-groups__meta">{person.group.name}</span> : null}
                </span>
                <AttendanceBar slots={board.slots} person={person} />
              </li>
            );
          })}
        </ul>
      )}
      {editable ? (
        <div className={`event-groups__drop-end${dragging ? " event-groups__drop-end--active" : ""}${over ? " event-groups__drop-end--over" : ""}`} aria-hidden="true">
          + 여기로 끌어서 넣기
        </div>
      ) : null}
      {editable && chosenCount > 0 ? (
        <Button type="button" variant="secondary" size={40} className="event-groups__send" disabled={busy} onClick={onSend}>
          고른 {chosenCount}명 이 방으로 보내기
        </Button>
      ) : null}
    </article>
  );
}

function RoomForm({
  idPrefix,
  label,
  initial,
  genderOptions,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  label: string;
  initial: Room | null;
  genderOptions: GenderOption[];
  busy: boolean;
  submitLabel: string;
  onSubmit: (fields: RoomFields) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [locationNote, setLocationNote] = useState(initial?.locationNote ?? "");
  const [capacity, setCapacity] = useState(initial?.capacity !== null && initial?.capacity !== undefined ? String(initial.capacity) : "");
  const [gender, setGender] = useState(initial?.gender?.optionId ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const fields = readRoomFields(name, locationNote, capacity, gender);
    if (typeof fields === "string") {
      setError(fields);
      return;
    }
    setError(null);
    void onSubmit(fields).then((ok) => {
      if (ok && !initial?.roomId) setName("");
    });
  }

  return (
    <form className="event-rooms__form" onSubmit={submit} aria-label={label}>
      <label className="event-groups__field">
        <span className="event-groups__field-label">방 이름</span>
        <input
          id={`${idPrefix}-name`}
          className="event-groups__input"
          value={name}
          maxLength={ROOM_NAME_MAX}
          required
          autoFocus={Boolean(initial?.roomId)}
          onChange={(change) => setName(change.target.value)}
          onKeyDown={(key) => {
            if (key.key === "Escape") onCancel?.();
          }}
        />
      </label>
      <label className="event-groups__field event-rooms__field--narrow">
        <span className="event-groups__field-label">정원</span>
        <input
          className="event-groups__input"
          inputMode="numeric"
          value={capacity}
          placeholder="없음"
          onChange={(change) => setCapacity(change.target.value)}
        />
      </label>
      <label className="event-groups__field">
        <span className="event-groups__field-label">성별 구분</span>
        <select className="event-groups__select" value={gender} onChange={(change) => setGender(change.target.value)}>
          <option value="">구분 없음</option>
          {genderOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="event-groups__field event-rooms__field--wide">
        <span className="event-groups__field-label">위치 메모 (참가자에게 보여요)</span>
        <input
          className="event-groups__input"
          value={locationNote}
          maxLength={ROOM_LOCATION_MAX}
          placeholder="예: 본관 3층 계단 옆"
          onChange={(change) => setLocationNote(change.target.value)}
        />
      </label>
      <div className="event-rooms__form-actions">
        <Button type="submit" variant="primary" size={32} disabled={busy}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="tertiary" size={32} onClick={onCancel}>
            취소
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="event-rooms__form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function AddRooms({
  rooms,
  genderOptions,
  busy,
  onCreate,
  onCreateMany,
  onClose,
}: {
  rooms: Room[];
  genderOptions: GenderOption[];
  busy: boolean;
  onCreate: (fields: RoomFields) => Promise<boolean>;
  onCreateMany: (names: string[], fields: Omit<RoomFields, "name">) => Promise<boolean>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"one" | "many">("one");
  const [prefix, setPrefix] = useState("");
  const [from, setFrom] = useState("301");
  const [to, setTo] = useState("310");
  const [suffix, setSuffix] = useState("호");
  const [capacity, setCapacity] = useState("6");
  const [gender, setGender] = useState("");
  const [locationNote, setLocationNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const names = numberedRoomNames(prefix, Number(from), Number(to), suffix);

  function submitMany(event: FormEvent) {
    event.preventDefault();
    if (names.length === 0) {
      setError("번호는 0 이상, 끝 번호가 시작 번호보다 크거나 같게, 한 번에 100개까지 써 주세요.");
      return;
    }
    if (names.some((name) => [...name].length > ROOM_NAME_MAX)) {
      setError(`방 이름은 ${ROOM_NAME_MAX}자까지예요.`);
      return;
    }
    const fields = readRoomFields(names[0], locationNote, capacity, gender);
    if (typeof fields === "string") {
      setError(fields);
      return;
    }
    setError(null);
    const { name: _unused, ...rest } = fields;
    void _unused;
    void onCreateMany(names, rest);
  }

  return (
    <div className="event-rooms__add" role="group" aria-label="방 추가">
      <div className="event-rooms__add-tabs" role="radiogroup" aria-label="추가 방식">
        <label>
          <input type="radio" name="rooms-add-mode" checked={mode === "one"} onChange={() => setMode("one")} /> 한 개
        </label>
        <label>
          <input type="radio" name="rooms-add-mode" checked={mode === "many"} onChange={() => setMode("many")} /> 번호로 여러 개
        </label>
        <Button type="button" variant="tertiary" size={32} onClick={onClose}>
          닫기
        </Button>
      </div>
      {mode === "one" ? (
        <RoomForm
          key={rooms.length}
          idPrefix="rooms-new"
          label="방 만들기"
          initial={{ ...EMPTY_ROOM, name: nextRoomName(rooms) }}
          genderOptions={genderOptions}
          busy={busy}
          submitLabel="방 만들기"
          onSubmit={onCreate}
        />
      ) : (
        <form className="event-rooms__form" onSubmit={submitMany} aria-label="번호로 여러 방 만들기">
          <label className="event-groups__field event-rooms__field--narrow">
            <span className="event-groups__field-label">앞 글자</span>
            <input className="event-groups__input" value={prefix} placeholder="예: 본관 " onChange={(change) => setPrefix(change.target.value)} />
          </label>
          <label className="event-groups__field event-rooms__field--narrow">
            <span className="event-groups__field-label">시작 번호</span>
            <input className="event-groups__input" inputMode="numeric" value={from} onChange={(change) => setFrom(change.target.value)} />
          </label>
          <label className="event-groups__field event-rooms__field--narrow">
            <span className="event-groups__field-label">끝 번호</span>
            <input className="event-groups__input" inputMode="numeric" value={to} onChange={(change) => setTo(change.target.value)} />
          </label>
          <label className="event-groups__field event-rooms__field--narrow">
            <span className="event-groups__field-label">뒤 글자</span>
            <input className="event-groups__input" value={suffix} onChange={(change) => setSuffix(change.target.value)} />
          </label>
          <label className="event-groups__field event-rooms__field--narrow">
            <span className="event-groups__field-label">정원</span>
            <input className="event-groups__input" inputMode="numeric" value={capacity} placeholder="없음" onChange={(change) => setCapacity(change.target.value)} />
          </label>
          <label className="event-groups__field">
            <span className="event-groups__field-label">성별 구분</span>
            <select className="event-groups__select" value={gender} onChange={(change) => setGender(change.target.value)}>
              <option value="">구분 없음</option>
              {genderOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="event-groups__field event-rooms__field--wide">
            <span className="event-groups__field-label">위치 메모 (참가자에게 보여요)</span>
            <input className="event-groups__input" value={locationNote} maxLength={ROOM_LOCATION_MAX} onChange={(change) => setLocationNote(change.target.value)} />
          </label>
          <div className="event-rooms__form-actions">
            <Button type="submit" variant="primary" size={32} disabled={busy || names.length === 0}>
              {names.length > 0 ? `${names[0]}~${names.at(-1)} ${names.length}개 만들기` : "만들기"}
            </Button>
          </div>
          {error ? (
            <p className="event-rooms__form-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}

const EMPTY_ROOM: Room = {
  roomId: "",
  name: "",
  locationNote: null,
  capacity: null,
  gender: null,
  sortOrder: 0,
  version: 0,
  memberCount: 0,
  warnings: [],
};

/** 조 단위 일괄 배정 (DEC-085 §5): one request with the group's members; people who do not sleep over stay out. */
function GroupBatch({
  eventId,
  board,
  busy,
  onSend,
}: {
  eventId: string;
  board: RoomBoard;
  busy: boolean;
  onSend: (roomId: string, ids: string[], label: string) => void;
}) {
  const hasDraft = board.participants.some((person) => person.draftGroupId !== null);
  const [source, setSource] = useState<"published" | "draft">("published");
  const [groupId, setGroupId] = useState("");
  const [roomId, setRoomId] = useState("");
  const draftBoard = useQuery({
    queryKey: queryKeys.groupBoard(eventId),
    queryFn: ({ signal }) => getGroupBoard(eventId, signal),
    enabled: hasDraft && source === "draft",
    retry: false,
  });
  const groups =
    source === "draft"
      ? (draftBoard.data?.groups ?? []).map((group) => ({ groupId: group.groupId, name: group.name }))
      : board.groups.map((group) => ({ groupId: group.groupId, name: group.name }));
  const group = groups.find((item) => item.groupId === groupId) ?? null;
  const members = group ? groupMembers(board.participants, group.groupId, source) : [];
  const skipped = members.filter((person) => person.lodging === "NOT_LODGING").length;
  const room = board.rooms.find((item) => item.roomId === roomId) ?? null;
  const moving = room ? members.filter((person) => person.lodging !== "NOT_LODGING" && person.roomId !== room.roomId).length : 0;
  return (
    <section className="event-rooms__batch" aria-labelledby="rooms-batch-title">
      <h2 id="rooms-batch-title" className="event-groups__subtitle">
        조 단위로 넣기
      </h2>
      <p className="event-groups__muted">
        {source === "draft" ? "조 편성 작업본" : "공개된 조 편성"}의 조원을 한 번에 한 방에 넣어요. 나중에 조가 바뀌어도 방은 그대로예요.
      </p>
      <div className="event-groups__filters">
        {hasDraft ? (
          <label className="event-groups__field">
            <span className="event-groups__field-label">조 기준</span>
            <select
              className="event-groups__select"
              value={source}
              onChange={(change) => {
                setSource(change.target.value as "published" | "draft");
                setGroupId("");
              }}
            >
              <option value="published">공개된 조</option>
              <option value="draft">작업 중인 조</option>
            </select>
          </label>
        ) : null}
        <label className="event-groups__field">
          <span className="event-groups__field-label">조</span>
          <select className="event-groups__select" value={group ? groupId : ""} onChange={(change) => setGroupId(change.target.value)}>
            <option value="">조 고르기</option>
            {groups.map((item) => (
              <option key={item.groupId} value={item.groupId}>
                {item.name} ({groupMembers(board.participants, item.groupId, source).length}명)
              </option>
            ))}
          </select>
        </label>
        <label className="event-groups__field">
          <span className="event-groups__field-label">방</span>
          <select className="event-groups__select" value={room ? roomId : ""} onChange={(change) => setRoomId(change.target.value)}>
            <option value="">방 고르기</option>
            {board.rooms.map((item) => (
              <option key={item.roomId} value={item.roomId}>
                {item.name} ({item.memberCount}
                {item.capacity !== null ? `/${item.capacity}` : ""}명)
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="primary"
          size={40}
          disabled={busy || !group || !room || moving === 0}
          onClick={() => group && room && onSend(room.roomId, members.map((person) => person.participantId), `${group.name} ${moving}명`)}
        >
          {group && room ? `${group.name} ${moving}명 넣기` : "넣기"}
        </Button>
      </div>
      {group && skipped > 0 ? <p className="event-rooms__not-lodging-note">숙박하지 않는 {skipped}명은 빼고 넣어요.</p> : null}
      {group && room && room.capacity !== null && room.memberCount + moving > room.capacity ? (
        <p className="event-rooms__not-lodging-note">넣으면 정원 {room.capacity}명을 넘어요. 막지는 않아요.</p>
      ) : null}
    </section>
  );
}

function RosterScope({ eventId, maySet, published }: { eventId: string; maySet: boolean; published: boolean }) {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: queryKeys.participantSettings(eventId),
    queryFn: ({ signal }) => getParticipantSettings(eventId, signal),
    retry: false,
  });
  const [message, setMessage] = useState<Notice | null>(null);
  const [saving, setSaving] = useState(false);
  if (!settings.data) return null;
  const current = settings.data;

  async function save(scope: RoomRosterScope) {
    setSaving(true);
    setMessage(null);
    try {
      await updateRoomRosterScope(eventId, scope, current.version);
      setMessage({ tone: "success", text: `참가자가 ${ROSTER_SCOPE_LABEL[scope]} 보도록 바꿨어요.${published ? " 참가자 화면에 바로 반영돼요." : ""}` });
    } catch (error) {
      setMessage({
        tone: "error",
        text: isApiError(error, "CONCURRENT_MODIFICATION")
          ? "다른 운영자가 먼저 바꿨어요. 최신 값을 불러왔으니 다시 골라 주세요."
          : isApiError(error, "FORBIDDEN")
            ? "행사 설정 권한이 없어 바꾸지 않았어요."
            : "공개 범위를 바꾸지 못했어요.",
      });
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.participantSettings(eventId) });
    setSaving(false);
  }

  return (
    <section className="event-rooms__scope" aria-labelledby="rooms-scope-title">
      <h2 id="rooms-scope-title" className="event-groups__subtitle">
        참가자가 보는 범위
      </h2>
      <p className="event-groups__muted">연락처·신청 답·숙박 밤·미배정 명단은 어떤 범위에서도 보이지 않아요. 조장은 범위와 상관없이 조원의 방을 봐요.</p>
      <div className="event-rooms__scope-options" role="radiogroup" aria-label="방 배정표 공개 범위">
        {(["ALL", "ROOMMATES", "MY_ROOM"] as const).map((scope) => (
          <label key={scope} className="event-rooms__scope-option">
            <input
              type="radio"
              name="rooms-scope"
              checked={current.roomRosterScope === scope}
              disabled={!maySet || saving}
              onChange={() => void save(scope)}
            />
            {ROSTER_SCOPE_LABEL[scope]}
            {scope === "ALL" ? " (기본)" : ""}
          </label>
        ))}
      </div>
      {!maySet ? <p className="event-groups__muted">공개 범위는 행사 설정 권한이 있는 운영자가 바꿔요.</p> : null}
      {message ? (
        <p className={`event-groups__notice event-groups__notice--${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

function PublishDialog({
  board,
  state,
  busy,
  onNotify,
  onCancel,
  onConfirm,
}: {
  board: RoomBoard;
  state: Publishing;
  busy: boolean;
  onNotify: (notify: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const publication = board.publication;
  const first = publication.lastPublishedAt === null;
  const unchanged = !first && !publication.hasUnpublishedChanges;
  const unassigned = state.unassigned ?? publication.unassignedCount;
  const notLodging = state.notLodging ?? publication.notLodgingAssignedCount;
  const asking = state.unassigned !== null || state.notLodging !== null;
  const warned = board.rooms.filter((room) => room.warnings.length > 0).length;
  const notLodgingPeople = board.participants.filter((person) => person.lodging === "NOT_LODGING" && person.roomId !== null);
  const title = asking
    ? [state.unassigned !== null ? `미배정 ${count(unassigned)}명` : null, state.notLodging !== null ? `방에 남은 숙박 안 함 ${count(notLodging)}명` : null]
        .filter(Boolean)
        .join(", ") + "을 두고 공개할까요?"
    : "참가자에게 숙소를 공개할까요?";
  return (
    <ConfirmDialog
      title={title}
      onClose={onCancel}
      scroll
      footer={
        <>
          <Button type="button" variant="secondary" size={40} onClick={onCancel}>
            취소
          </Button>
          <Button type="button" variant="primary" size={40} loading={busy} onClick={onConfirm}>
            {asking ? "확인하고 공개" : "공개"}
          </Button>
        </>
      }
    >
      {state.stale ? (
        <p className="event-groups__publish-stale" role="alert">
          그사이 배정판이 바뀌어 공개하지 않았어요. 최신 배정판을 불러왔으니 아래 내용을 다시 확인해 주세요.
        </p>
      ) : null}
      {state.unassigned !== null ? (
        <p>아직 방이 없는 숙박 참가자 {count(unassigned)}명은 숙소 화면에서 &ldquo;아직 방이 정해지지 않았어요&rdquo;로 보여요.</p>
      ) : null}
      {state.notLodging !== null ? (
        <p>
          방에 넣은 뒤 숙박을 뺀 {count(notLodging)}명({notLodgingPeople.map(participantLabel).join(", ")})이 방에 남아 있어요. 공개하면 그 방 명단에 다른 사람과 똑같이
          보여요. 빼려면 취소하고 미배정으로 빼 주세요.
        </p>
      ) : null}
      {!asking ? <p>참가자는 자기 방 이름·위치 메모와, 공개 범위에 따라 같은 방 사람·전체 방 배정표를 봐요. 연락처는 보이지 않아요.</p> : null}
      <div className="event-groups__publish-box">
        <p className="event-groups__publish-box-title">{first ? "처음 공개" : unchanged ? "바뀐 내용 없음" : "이번에 바뀌는 내용"}</p>
        <ul className="event-groups__publish-list" aria-label="공개되는 내용">
          <li>방이 바뀌는 사람 {count(publication.changedParticipantCount)}명</li>
          <li>바뀐 방 {count(publication.roomChanges)}개</li>
          <li>미배정 {count(unassigned)}명</li>
          {notLodging > 0 ? <li>방에 남은 숙박 안 함 {count(notLodging)}명</li> : null}
          {warned > 0 ? <li>정원·성별 경고가 있는 방 {count(warned)}개 (공개는 막지 않아요)</li> : null}
        </ul>
        {unchanged ? <p className="event-groups__publish-box-note">지금 참가자에게 보이는 숙소 배정과 같아요.</p> : null}
      </div>
      <label className="event-rooms__notify">
        <input type="checkbox" checked={state.notify} onChange={(change) => onNotify(change.target.checked)} />
        {first ? "방이 정해진 참가자에게 알림 보내기" : "방이 바뀐 참가자에게 알림 보내기"}
      </label>
    </ConfirmDialog>
  );
}

function Filters({
  filters,
  options,
  onChange,
}: {
  filters: RoomFilters;
  options: ReturnType<typeof filterOptions>;
  onChange: (filters: RoomFilters) => void;
}) {
  const set = (patch: Partial<RoomFilters>) => onChange({ ...filters, ...patch });
  const active = hasAnswerFilter(filters) || filters.assignment !== "unassigned";
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
      <Select label="배정 상태" value={filters.assignment} onChange={(value) => set({ assignment: value as RoomAssignmentFilter })}>
        <option value="unassigned">미배정</option>
        <option value="assigned">배정됨</option>
        <option value="review">다시 볼 것</option>
        <option value="all">전체</option>
      </Select>
      <AnswerSelect label="성별" value={filters.gender} options={options.gender} onChange={(gender) => set({ gender })} />
      <AnswerSelect label="또래" value={filters.cohort} options={options.cohort} onChange={(cohort) => set({ cohort })} />
      <Select label="참석 방식" value={filters.attendance} onChange={(attendance) => set({ attendance })}>
        <option value={ANY}>전체</option>
        <option value="FULL">전체 참석</option>
        <option value="PARTIAL">부분 참석</option>
        <option value="WORSHIP_ONLY">집회만</option>
      </Select>
      <AnswerSelect label="숙박" value={filters.lodging} options={options.lodging} onChange={(lodging) => set({ lodging })} />
      {options.group.length > 0 ? <AnswerSelect label="조" value={filters.group} options={options.group} onChange={(group) => set({ group })} /> : null}
      {active ? (
        <Button type="button" variant="tertiary" size={40} onClick={() => onChange(EMPTY_ROOM_FILTERS)}>
          초기화
        </Button>
      ) : null}
    </div>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
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
    <Select label={label} value={value} onChange={onChange}>
      <option value={ANY}>전체</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label} ({option.count})
        </option>
      ))}
    </Select>
  );
}

function NamePill({ person, genderOptions }: { person: RoomParticipant; genderOptions: GenderOption[] }) {
  const tone = genderTone(person.gender?.optionId, genderOptions);
  return (
    <span className={`event-groups__pill-name event-groups__pill-name--${tone}`}>
      <span className="event-groups__name">{participantLabel(person)}</span>
      {person.gender ? <span className="event-groups__visually-hidden"> ({person.gender.label})</span> : null}
    </span>
  );
}

function Grip({ label, onStart }: { label: string; onStart: (event: ReactPointerEvent<HTMLElement>) => void }) {
  return (
    <button
      type="button"
      className="event-groups__grip"
      aria-label={label}
      title={label}
      onPointerDown={(event) => {
        event.stopPropagation();
        onStart(event);
      }}
      onClick={(click) => click.preventDefault()}
    >
      <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true" focusable="false">
        {[3, 8, 13].flatMap((y) => [<circle key={`a${y}`} cx="2.5" cy={y} r="1.5" />, <circle key={`b${y}`} cx="7.5" cy={y} r="1.5" />])}
      </svg>
    </button>
  );
}

function PoolCard({
  person,
  board,
  genderOptions,
  showRoom,
  selectable,
  checked,
  dragging,
  onToggle,
  onStart,
}: {
  person: RoomParticipant;
  board: RoomBoard;
  genderOptions: GenderOption[];
  showRoom: boolean;
  selectable: boolean;
  checked: boolean;
  dragging: boolean;
  onToggle: () => void;
  onStart: (event: ReactPointerEvent<HTMLElement>, fromGrip: boolean) => void;
}) {
  const label = participantLabel(person);
  const blockedHere = person.lodging === "NOT_LODGING" && person.roomId === null;
  const canPick = selectable && !blockedHere;
  const meta = [person.gender?.label, person.group?.name, showRoom ? roomName(board.rooms, person.roomId) : null].filter(Boolean);
  const body = (
    <>
      <span className="event-groups__card-name">
        {canPick ? <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`${label} 고르기`} /> : null}
        <NamePill person={person} genderOptions={genderOptions} />
        {person.review ? (
          <span className="event-rooms__flag" title="다시 볼 것">
            ⚑<span className="event-groups__visually-hidden"> 다시 볼 것</span>
          </span>
        ) : null}
        {canPick ? <Grip label={`${label} 끌어서 옮기기`} onStart={(event) => onStart(event, true)} /> : null}
      </span>
      <AttendanceBar slots={board.slots} person={person} />
      <span className="event-groups__pool-meta">
        <span className={`event-rooms__tag event-rooms__tag--${person.lodging.toLowerCase().replace("_", "-")}`}>
          {person.lodging === "LODGING" ? nightsText(person) : LODGING_LABEL[person.lodging]}
        </span>
        {meta.length > 0 ? <span className="event-groups__meta">{meta.join(" · ")}</span> : null}
      </span>
      {blockedHere && selectable ? <span className="event-rooms__blocked-note">방에 넣을 수 없어요</span> : null}
    </>
  );
  if (!canPick) return <div className={`event-groups__pool-card${blockedHere ? " event-rooms__pool-card--blocked" : ""}`}>{body}</div>;
  return (
    <label
      className={`event-groups__pool-card event-groups__pool-card--selectable${checked ? " event-groups__pool-card--checked" : ""}${dragging ? " event-groups__pool-card--dragging" : ""}`}
      onPointerDown={(event) => onStart(event, false)}
    >
      {body}
    </label>
  );
}

/** Gender options for a room's split: every option someone chose plus the ones rooms already use. */
function roomGenderOptions(board: RoomBoard): GenderOption[] {
  const map = new Map<string, string>();
  for (const person of board.participants) if (person.gender) map.set(person.gender.optionId, person.gender.label);
  for (const room of board.rooms) if (room.gender && !map.has(room.gender.optionId)) map.set(room.gender.optionId, room.gender.label ?? room.gender.optionId);
  return [...map.entries()].map(([value, label]) => ({ value, label }));
}

function readRoomFields(name: string, locationNote: string, capacity: string, gender: string): RoomFields | string {
  const trimmed = name.trim();
  if (trimmed.length === 0 || [...trimmed].length > ROOM_NAME_MAX) return `방 이름은 1–${ROOM_NAME_MAX}자로 써 주세요.`;
  const note = locationNote.trim();
  if ([...note].length > ROOM_LOCATION_MAX) return `위치 메모는 ${ROOM_LOCATION_MAX}자까지예요.`;
  let size: number | null = null;
  if (capacity.trim().length > 0) {
    size = Number(capacity.trim());
    if (!Number.isInteger(size) || size < 1 || size > ROOM_CAPACITY_MAX) return `정원은 1–${ROOM_CAPACITY_MAX} 사이 숫자로 써 주세요. 비우면 정원 없음이에요.`;
  }
  return { name: trimmed, locationNote: note.length > 0 ? note : null, capacity: size, genderOptionId: gender || null };
}

function roomWriteFailure(error: unknown, roomCount: number): string {
  if (isApiError(error, "CONFLICT")) {
    return error.extensions.reason === "ROOM_LIMIT" || roomCount >= ROOMS_MAX
      ? `방은 ${ROOMS_MAX}개까지 만들 수 있어요.`
      : "같은 이름의 방이 있어요. 다른 이름을 써 주세요.";
  }
  if (isApiError(error, "CONCURRENT_MODIFICATION")) return "다른 운영자가 이 방을 먼저 고쳐서 저장하지 않았어요. 최신 상태를 불러왔으니 다시 확인해 주세요.";
  if (isApiError(error, "VALIDATION_FAILED")) return "방 정보를 다시 확인해 주세요. 성별 구분은 신청서의 성별 보기여야 해요.";
  return "방을 저장하지 못했어요.";
}

function extensionCount(error: unknown, key: string): number {
  if (!isApiError(error)) return 0;
  const raw = error.extensions[key];
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : 0;
}

function totalCapacity(rooms: Room[]): number {
  return rooms.reduce((sum, room) => sum + (room.capacity ?? 0), 0);
}

function count(value: number): string {
  return value.toLocaleString("ko-KR");
}

function publishedText(board: RoomBoard): string {
  const { lastPublishedAt, lastPublishedByDisplayName } = board.publication;
  if (!lastPublishedAt) return "아직 공개하지 않았어요.";
  return `마지막 공개 ${formatPublishedAt(lastPublishedAt)}${lastPublishedByDisplayName ? ` · ${lastPublishedByDisplayName}` : ""}.`;
}

function dragText(label: string, over: DragOver, board: RoomBoard): string {
  const what = `${label}을 옮기는 중`;
  if (!over) return `${what}. 방 위에서 손을 떼세요. Esc를 누르면 취소돼요.`;
  if (over.kind === "pool") return `${what}. 여기에 놓으면 미배정이 돼요.`;
  if (over.kind === "group") return `${what}. ${roomName(board.rooms, over.groupId)}에 넣어요.`;
  return what;
}

function blockedReason(status: LifecycleStatus, mayWrite: boolean, permissionsPending: boolean): string | null {
  if (status === "ENDED") return "종료된 행사라 숙소를 바꿀 수 없어요. 배정판은 볼 수 있어요.";
  if (status === "ARCHIVED") return "보관된 행사라 숙소를 바꿀 수 없어요. 배정판은 읽기 전용이에요.";
  if (permissionsPending) return null;
  if (!mayWrite) return "숙소 권한이 없어 배정판만 볼 수 있어요. 행사 OWNER에게 권한을 요청해 주세요.";
  return null;
}

function commonFailure(error: unknown): string | null {
  if (isApiError(error, "EVENT_ENDED")) return "종료된 행사라 저장하지 않았어요.";
  if (isApiError(error, "EVENT_ARCHIVED")) return "보관된 행사라 저장하지 않았어요.";
  if (isApiError(error, "FORBIDDEN")) return "숙소 권한이 없어 저장하지 않았어요.";
  if (isApiError(error, "NETWORK_ERROR", "UNEXPECTED") || (isApiError(error) && error.status >= 500)) {
    return "결과를 확인하지 못했어요. 배정판을 다시 불러왔으니 반영됐는지 확인해 주세요.";
  }
  return null;
}

function poolTitle(assignment: RoomAssignmentFilter): string {
  if (assignment === "unassigned") return "미배정 참가자";
  if (assignment === "assigned") return "배정된 참가자";
  if (assignment === "review") return "다시 볼 참가자";
  return "참가자";
}

function poolEmpty(filters: RoomFilters, total: number): string {
  if (total === 0) return "아직 신청한 참가자가 없어요.";
  if (filters.assignment === "unassigned" && !hasAnswerFilter(filters)) return "숙박하는 사람을 모두 방에 넣었어요.";
  return "조건에 맞는 참가자가 없어요.";
}

