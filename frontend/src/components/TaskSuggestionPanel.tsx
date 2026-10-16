import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EVENT_TYPE_OPTIONS } from "../api/eventTypes";
import type { EventType } from "../api/events";
import { getEvent } from "../api/events";
import { queryKeys } from "../api/queryKeys";
import { createTask } from "../api/tasks";
import { taskSuggester as defaultSuggester, toDurationBucket } from "../ai/taskSuggestions";
import type { TaskSuggester, TaskSuggestion } from "../ai/taskSuggestions";
import { Button } from "./Button";
import "./TaskSuggestionPanel.css";

const TYPES: EventType[] = [
  "RETREAT",
  "VISION_TRIP",
  "OUTREACH",
  "SHORT_TERM_MISSION",
  "BIBLE_SCHOOL",
  "CAMP",
  "WORKSHOP",
  "OTHER",
];

export function TaskSuggestionPanel({
  eventId,
  titles,
  suggester = defaultSuggester,
}: {
  eventId: string;
  titles: string[];
  suggester?: TaskSuggester;
}) {
  const queryClient = useQueryClient();
  const event = useQuery({
    queryKey: queryKeys.event(eventId),
    queryFn: () => getEvent(eventId),
    enabled: eventId.length > 0,
  });
  const [picked, setPicked] = useState<EventType | "COMMON" | undefined>(undefined);
  const [more, setMore] = useState(false);
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [added, setAdded] = useState(0);
  const [missed, setMissed] = useState(0);
  const [pending, setPending] = useState(false);

  const serverType = event.data?.eventType ?? null;
  const eventType = picked === "COMMON" ? null : (picked ?? serverType);
  const durationBucket = toDurationBucket(event.data?.startDate ?? null, event.data?.endDate ?? null);

  useEffect(() => {
    if (!event.data) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3000);
    let alive = true;
    const onAbort = () => {
      if (alive) setFailed(true);
    };
    controller.signal.addEventListener("abort", onAbort);
    queueMicrotask(() => {
      if (alive) setFailed(false);
    });
    suggester
      .suggestTasks({ eventType, durationBucket }, { signal: controller.signal })
      .then((next) => {
        if (!alive || controller.signal.aborted) return;
        setSuggestions(next);
        setSelected([]);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      controller.signal.removeEventListener("abort", onAbort);
      controller.abort();
    };
  }, [event.data, eventType, durationBucket, suggester]);

  const taken = new Set(titles.map((title) => title.trim()));

  async function addSelected() {
    const chosen = suggestions.filter(
      (item) => selected.includes(item.suggestionId) && !taken.has(item.title),
    );
    if (chosen.length === 0) return;
    setPending(true);
    setAdded(0);
    setMissed(0);
    const still: string[] = [];
    let ok = 0;
    for (const item of chosen) {
      try {
        await createTask(eventId, { title: item.title });
        ok += 1;
      } catch {
        still.push(item.suggestionId);
      }
    }
    setSelected(still);
    setAdded(ok);
    setMissed(still.length);
    setPending(false);
    if (ok > 0) {
      await queryClient.invalidateQueries({ queryKey: ["events", eventId, "tasks"] });
    }
  }

  if (event.isPending) return <p className="task-suggest__note">불러오는 중이에요.</p>;
  if (!event.data) return null;

  return (
    <section className="task-suggest" aria-label="추천 업무">
      <h3 className="task-suggest__title">추천 업무</h3>
      {serverType === null ? (
        <div className="task-suggest__chips">
          <p>행사 유형을 고르면 더 맞는 추천을 볼 수 있어요.</p>
          <div>
            {EVENT_TYPE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={picked === option.value ? "primary" : "tertiary"}
                size={32}
                onClick={() => setPicked(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {failed ? (
        <p role="status">추천을 불러오지 못했어요 · 직접 추가해 주세요</p>
      ) : (
        <ul className="task-suggest__list">
          {suggestions.map((item) => {
            const exists = taken.has(item.title);
            return (
              <li key={item.suggestionId}>
                <label>
                  <input
                    type="checkbox"
                    checked={!exists && selected.includes(item.suggestionId)}
                    disabled={exists}
                    onChange={(change) => {
                      setSelected((current) =>
                        change.target.checked
                          ? [...current, item.suggestionId]
                          : current.filter((id) => id !== item.suggestionId),
                      );
                    }}
                  />
                  <span>{item.title}</span>
                  {exists ? <span>이미 있어요</span> : null}
                </label>
                <p className="task-suggest__preview">{item.checklist.join(", ")}</p>
              </li>
            );
          })}
        </ul>
      )}
      <p className="task-suggest__note">
        체크 항목은 아직 저장되지 않아요. 업무를 만든 뒤 필요한 내용을 확인해 주세요.
      </p>
      {added > 0 ? <p role="status">업무 {added}개를 추가했어요.</p> : null}
      {missed > 0 ? <p role="alert">{missed}개는 추가하지 못했어요. 다시 시도해 주세요.</p> : null}
      <div className="task-suggest__actions">
        <Button
          type="button"
          variant="primary"
          size={40}
          loading={pending}
          disabled={selected.length === 0}
          onClick={() => void addSelected()}
        >
          선택한 업무 추가 ({selected.length})
        </Button>
        <Button type="button" variant="tertiary" size={40} onClick={() => setMore((open) => !open)}>
          다른 추천도 보기
        </Button>
      </div>
      {more ? (
        <div className="task-suggest__chips" role="group" aria-label="다른 추천">
          <Button type="button" variant={picked === "COMMON" ? "primary" : "tertiary"} size={32} onClick={() => setPicked("COMMON")}>
            공통
          </Button>
          {TYPES.map((type) => (
            <Button
              key={type}
              type="button"
              variant={picked === type ? "primary" : "tertiary"}
              size={32}
              onClick={() => setPicked(type)}
            >
              {EVENT_TYPE_OPTIONS.find((option) => option.value === type)?.label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
