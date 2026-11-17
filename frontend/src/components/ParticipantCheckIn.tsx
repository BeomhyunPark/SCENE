import { useQuery } from "@tanstack/react-query";
import { isApiError } from "../api/errors";
import { getParticipantCheckIn, type ParticipantCheckIn as CheckInState } from "../api/participantCheckIn";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { formatSubmittedAt } from "./eventFormat";
import "./ParticipantCheckIn.css";
import { qrPath } from "./qrPath";

/**
 * Arrival QR for the signed-in participant (#284, DEC-071). The value lives only in the query cache:
 * it stays on screen if a later reload fails, and it is never written to web storage. Coming back to
 * the tab reloads (React Query refetches on focus), and the refresh button reloads on demand.
 */
export function ParticipantCheckIn({ eventId }: { eventId: string }) {
  const query = useQuery({
    queryKey: queryKeys.participantCheckIn(eventId),
    queryFn: ({ signal }) => getParticipantCheckIn(signal),
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });

  const refresh = (
    <Button
      type="button"
      variant="secondary"
      size={40}
      loading={query.isFetching}
      onClick={() => void reloadQuery(query)}
    >
      새로 고침
    </Button>
  );

  if (query.isPending) {
    return (
      <section className="participant-checkin" aria-label="도착 확인">
        <p className="participant-gate__body">도착 QR을 불러오는 중이에요.</p>
      </section>
    );
  }

  if (query.isError && !query.data) {
    return (
      <section className="participant-checkin" aria-label="도착 확인">
        <p className="participant-gate__body">{errorText(query.error)}</p>
        {refresh}
      </section>
    );
  }

  const data = query.data!;
  return (
    <section className="participant-checkin" aria-label="도착 확인">
      {data.checkedIn ? <Arrived at={data.checkedInAt} /> : null}
      {data.status === "AVAILABLE" && data.code ? (
        <>
          <QrCode value={data.code} />
          <p className="participant-gate__body">
            {data.checkedIn ? "다시 보여 줄 필요는 없어요." : "도착하면 접수처에 이 QR을 보여 주세요."} 화면 밝기를 올리면 더 잘 읽혀요.
          </p>
        </>
      ) : (
        <p className="participant-checkin__notice">{statusText(data)}</p>
      )}
      {query.isError ? <p className="participant-gate__error">최신 상태를 불러오지 못했어요. 연결을 확인하고 다시 눌러 주세요.</p> : null}
      {refresh}
    </section>
  );
}

function Arrived({ at }: { at: string | null }) {
  const time = at ? formatSubmittedAt(at) : "";
  return (
    <p className="participant-checkin__arrived" role="status">
      <strong>도착 확인됨</strong>
      {time ? <span> · {time}</span> : null}
    </p>
  );
}

function QrCode({ value }: { value: string }) {
  const { size, d } = qrPath(value);
  return (
    <div className="participant-checkin__qr">
      <svg
        role="img"
        aria-label="도착 QR"
        viewBox={`0 0 ${size} ${size}`}
        shapeRendering="crispEdges"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width={size} height={size} fill="#ffffff" />
        <path d={d} fill="#000000" />
      </svg>
    </div>
  );
}

function statusText(data: CheckInState): string {
  switch (data.status) {
    case "NOT_STARTED":
      return "행사가 시작되면 열립니다.";
    case "ENDED":
      return "행사가 끝났습니다.";
    case "NOT_ELIGIBLE":
      return "신청이 취소되어 도착 QR이 없어요. 접수처에 이름을 말해 주세요.";
    default:
      return "도착 QR을 보여 줄 수 없어요.";
  }
}

function errorText(error: unknown): string {
  if (isApiError(error, "RESOURCE_NOT_FOUND")) {
    return "도착 QR이 아직 준비되지 않았어요. 접수처에 이름을 말해 주세요.";
  }
  if (isApiError(error, "AUTHENTICATION_REQUIRED")) return "링크로 다시 들어와 주세요.";
  return "도착 QR을 불러오지 못했어요.";
}
