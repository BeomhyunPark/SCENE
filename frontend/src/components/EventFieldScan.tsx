import { useEffect, useRef, useState } from "react";
import { isCheckInQr, type CheckInResult } from "../api/checkIns";
import { isApiError } from "../api/errors";
import { Button } from "./Button";
import { formatSubmittedAt } from "./eventFormat";
import { CameraError, startQrCamera, type CameraFailure } from "./qrCamera";
import { isEventBlocked, type ActionDelivery, type CheckInAction } from "./useCheckInQueue";

/** A just-handled QR read again within this window after "다음 스캔" is ignored (#286). */
const REPEAT_MS = 2500;

type Outcome =
  | { kind: "checked-in" | "already"; result: CheckInResult }
  | { kind: "not-scene" | "not-event" | "withdrawn" | "forbidden" | "unconfirmed" | "offline" | "failed" };

type CameraState = "starting" | "live" | CameraFailure;

/**
 * Camera QR check-in for 현장 운영 (#286, DEC-071). One read at a time: while a request is out or a
 * result is on screen every read is ignored, so a QR held in front of the camera sends one request.
 * Values without the SCENE prefix never reach the server. Requests go through the page's check-in queue
 * (#287): the same QR keeps its Idempotency-Key until the server answers, so scanning it again after
 * "확인 안 됨" resends rather than checking in twice. The camera stops when this unmounts. Copy is a draft.
 */
export function FieldScan({
  submit,
  onClose,
  onSearchInstead,
  onEventBlocked,
}: {
  /** The page's useCheckInQueue; it also reloads the summary and roster after an answer. */
  submit: (action: CheckInAction) => Promise<ActionDelivery>;
  onClose: () => void;
  onSearchInstead: () => void;
  /** The event left ACTIVE: the page shows why and closes the scanner. */
  onEventBlocked: (error: unknown) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<CameraState>("starting");
  const [attempt, setAttempt] = useState(0);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const busy = useRef(false);
  const last = useRef<{ code: string; at: number } | null>(null);
  const mounted = useRef(true);
  const handler = useRef<(code: string) => void>(() => {});

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    handler.current = (code: string) => {
      if (busy.current) return;
      const now = Date.now();
      if (last.current && last.current.code === code && now - last.current.at < REPEAT_MS) return;
      busy.current = true;
      last.current = { code, at: now };
      if (!isCheckInQr(code)) {
        setOutcome({ kind: "not-scene" });
        return;
      }
      setSending(true);
      void submit({ kind: "check-in", mode: "QR", code }).then((delivery) => {
        if (!mounted.current) return;
        setSending(false);
        if (delivery.kind === "done") {
          const result = delivery.value as CheckInResult;
          setOutcome({ kind: result.result === "CHECKED_IN" ? "checked-in" : "already", result });
          return;
        }
        if (delivery.kind === "refused" && isEventBlocked(delivery.error)) {
          onEventBlocked(delivery.error);
          return;
        }
        const kind = delivery.kind === "refused" ? failureKind(delivery.error) : delivery.kind;
        // A rescan of the same QR is the way forward after these, so it is not held back.
        if (kind === "unconfirmed" || kind === "offline" || kind === "failed") last.current = null;
        setOutcome({ kind });
      });
    };
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const abort = new AbortController();
    startQrCamera(video, (code) => handler.current(code), abort.signal).then(
      (started) => {
        if (abort.signal.aborted) started.stop();
        else setCamera("live");
      },
      (error: unknown) => {
        if (!abort.signal.aborted) setCamera(error instanceof CameraError ? error.reason : "failed");
      },
    );
    // Aborting stops the camera, whether it has opened yet or not.
    return () => abort.abort();
  }, [attempt]);

  function next() {
    setOutcome(null);
    if (last.current) last.current = { code: last.current.code, at: Date.now() };
    busy.current = false;
  }

  function retryCamera() {
    setCamera("starting");
    setAttempt((value) => value + 1);
  }

  const failed = camera !== "starting" && camera !== "live";

  return (
    <section className="event-field__scan" aria-label="QR 스캔">
      <div className="event-field__scan-head">
        <h2 className="event-field__scan-title">QR 스캔</h2>
        <Button type="button" variant="secondary" size={40} onClick={onClose}>
          스캔 닫기
        </Button>
      </div>

      {failed ? (
        <div className="event-field__scan-error" role="alert">
          <p className="event-field__scan-error-title">{cameraCopy(camera).title}</p>
          <p>{cameraCopy(camera).detail}</p>
          <div className="event-field__scan-actions">
            <Button type="button" variant="primary" size={48} onClick={onSearchInstead}>
              이름으로 찾기
            </Button>
            {camera === "denied" || camera === "busy" || camera === "failed" ? (
              <Button type="button" variant="secondary" size={48} onClick={retryCamera}>
                다시 시도
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="event-field__scan-view" hidden={failed}>
        <video ref={videoRef} className="event-field__scan-video" playsInline muted aria-label="카메라 화면" />
        <span className="event-field__scan-frame" aria-hidden="true" />
        {camera === "starting" ? <p className="event-field__scan-hint">카메라를 여는 중이에요.</p> : null}
        {outcome || sending ? <div className="event-field__scan-dim" aria-hidden="true" /> : null}
      </div>

      {!failed ? (
        <div className="event-field__scan-result-slot" aria-live="polite">
          {sending ? (
            <p className="event-field__scan-status" role="status">
              확인하는 중이에요.
            </p>
          ) : outcome ? (
            <ScanOutcome outcome={outcome} onNext={next} />
          ) : camera === "live" ? (
            <p className="event-field__scan-status">참가자의 체크인 QR을 네모 안에 맞춰 주세요.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ScanOutcome({ outcome, onNext }: { outcome: Outcome; onNext: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>(".event-field__scan-next")?.focus();
  }, []);
  const person = outcome.kind === "checked-in" || outcome.kind === "already" ? outcome.result : null;
  const copy = outcomeCopy(outcome);
  return (
    <div
      ref={box}
      className={`event-field__scan-result event-field__scan-result--${copy.tone}`}
      role={copy.tone === "error" ? "alert" : "status"}
    >
      <p className="event-field__scan-label">{copy.label}</p>
      {person ? (
        <>
          <p className="event-field__scan-name">{person.participant.name}</p>
          <p className="event-field__scan-cohort">
            {person.participant.cohort ? `또래 ${person.participant.cohort}` : "또래 정보 없음"}
          </p>
        </>
      ) : null}
      {copy.detail ? <p className="event-field__scan-detail">{copy.detail}</p> : null}
      <Button type="button" variant="primary" size={48} className="event-field__scan-next" onClick={onNext}>
        다음 스캔
      </Button>
    </div>
  );
}

function outcomeCopy(outcome: Outcome): { tone: "success" | "info" | "error"; label: string; detail?: string } {
  switch (outcome.kind) {
    case "checked-in":
      return { tone: "success", label: "체크인됨", detail: "이름과 또래가 맞는지 확인해 주세요." };
    case "already": {
      const check = outcome.result.checkIn;
      const by = check.checkedInByDisplayName ? ` · ${check.checkedInByDisplayName}` : "";
      return { tone: "info", label: "이미 체크인됨", detail: `처음 체크인 ${formatSubmittedAt(check.checkedInAt)}${by}` };
    }
    case "not-scene":
      return {
        tone: "error",
        label: "SCENE 체크인 QR이 아니에요",
        detail: "참가자에게 SCENE 체크인 화면의 QR을 보여 달라고 해 주세요.",
      };
    case "not-event":
      return {
        tone: "error",
        label: "이 행사의 QR이 아니에요",
        detail: "다른 행사의 QR일 수 있어요. 이름이나 전화 끝 4자리로 찾아 주세요.",
      };
    case "withdrawn":
      return { tone: "error", label: "신청이 철회됐어요", detail: "신청을 철회한 참가자라 체크인할 수 없어요." };
    case "forbidden":
      return { tone: "error", label: "체크인 권한이 없어요", detail: "행사 OWNER에게 권한을 요청해 주세요." };
    case "unconfirmed":
      return {
        tone: "error",
        label: "확인 안 됨",
        detail: "체크인됐는지 확인하지 못했어요. 연결을 확인하고 같은 QR을 다시 스캔하거나 '확인 안 된 요청'에서 다시 시도해 주세요.",
      };
    case "offline":
      return {
        tone: "info",
        label: "오프라인이에요",
        detail: "아직 보내지 않았어요. 연결되면 자동으로 다시 보내요. 결과는 '확인 안 된 요청'에서 볼 수 있어요.",
      };
    case "failed":
      return { tone: "error", label: "처리하지 못했어요", detail: "잠시 후 같은 QR을 다시 스캔해 주세요." };
  }
}

function cameraCopy(reason: CameraFailure): { title: string; detail: string } {
  const fallback = "이름이나 전화 끝 4자리로 찾아 체크인할 수 있어요.";
  switch (reason) {
    case "insecure":
      return { title: "HTTPS 주소에서만 카메라를 쓸 수 있어요", detail: `지금 주소에서는 카메라를 열 수 없어요. ${fallback}` };
    case "unsupported":
      return { title: "이 브라우저에서는 카메라를 쓸 수 없어요", detail: `Safari나 Chrome에서 열어 주세요. ${fallback}` };
    case "denied":
      return {
        title: "카메라 권한이 거부됐어요",
        detail: `브라우저 설정에서 이 사이트의 카메라를 허용한 뒤 다시 시도해 주세요. ${fallback}`,
      };
    case "no-camera":
      return { title: "사용할 수 있는 카메라가 없어요", detail: fallback };
    case "busy":
      return { title: "카메라를 쓰고 있는 다른 앱이 있어요", detail: `그 앱을 닫고 다시 시도해 주세요. ${fallback}` };
    default:
      return { title: "카메라를 열지 못했어요", detail: fallback };
  }
}

function failureKind(
  error: unknown,
): Exclude<Outcome["kind"], "checked-in" | "already" | "not-scene" | "unconfirmed" | "offline"> {
  if (isApiError(error, "RESOURCE_NOT_FOUND")) return "not-event";
  if (isApiError(error, "INVALID_STATE_TRANSITION") && error.extensions.reason === "APPLICATION_NOT_SUBMITTED") {
    return "withdrawn";
  }
  if (isApiError(error, "FORBIDDEN")) return "forbidden";
  return "failed";
}
