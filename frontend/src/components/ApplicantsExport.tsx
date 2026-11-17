import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { downloadApplicationsCsv } from "../api/applications";
import { isApiError } from "../api/errors";
import { getMyPermissions } from "../api/operators";
import { queryKeys } from "../api/queryKeys";
import { getMe } from "../api/session";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * "CSV 내려받기" on the applicant list (#233). Shown only with effective DATA_EXPORT, disabled with
 * no applicants, and one privacy confirmation before each download. Copy is a draft.
 */
export function ApplicantsExport({ eventId, total }: { eventId: string; total: number }) {
  const me = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  const permissions = useQuery({
    queryKey: queryKeys.permissions(eventId, me.data?.userId ?? ""),
    queryFn: () => getMyPermissions(eventId, me.data!.userId),
    enabled: Boolean(me.data?.userId),
  });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!(permissions.data?.effective.includes("DATA_EXPORT") ?? false)) return null;

  async function download() {
    setBusy(true);
    setError("");
    try {
      const file = await downloadApplicationsCsv(eventId);
      saveFile(file.blob, file.fileName);
      setConfirming(false);
    } catch (caught) {
      setConfirming(false);
      setError(
        isApiError(caught) && caught.code === "FORBIDDEN"
          ? "내려받을 권한이 없어요. 행사 소유자에게 요청해 주세요."
          : "내려받지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="event-home__export">
      <Button
        type="button"
        variant="secondary"
        size={40}
        disabled={total === 0}
        onClick={() => {
          setError("");
          setConfirming(true);
        }}
      >
        CSV 내려받기
      </Button>
      {total === 0 ? <p>신청이 들어오면 내려받을 수 있어요.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {confirming ? (
        <ConfirmDialog
          title="신청자 명단을 내려받을까요?"
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button type="button" variant="tertiary" size={40} disabled={busy} onClick={() => setConfirming(false)}>
                닫기
              </Button>
              <Button type="button" variant="primary" size={40} loading={busy} onClick={() => void download()}>
                내려받기
              </Button>
            </>
          }
        >
          <p>
            파일에 신청자 {total}명의 이름, 전화번호와 신청 답변이 들어 있어요. 행사 준비에만 쓰고, 다른 사람에게
            보내지 말고, 다 쓰면 지워 주세요.
          </p>
          <p>내려받으면 누가 언제 몇 명을 받았는지 기록돼요.</p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
