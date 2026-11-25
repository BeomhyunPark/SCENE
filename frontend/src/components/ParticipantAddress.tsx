import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { listForms } from "../api/forms";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { qrPath } from "./qrPath";
import "./ParticipantAddress.css";

/**
 * 주소·QR (#497, #483 제안 2): the apply address and the participant address used to sit under the
 * roster all the time. They now open from one button. Every action stays: copy the apply address,
 * copy the participant address, and its QR (DEC-078 §8). Read-only addresses are label-value rows
 * (fe-handoff "박스를 쓰는 때"), not input boxes. The way to 신청서 설정 is in the footer, since the
 * apply address only exists once applications are open there.
 */
export function AddressButton({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" size={40} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        주소·QR
      </Button>
      {open ? (
        <ConfirmDialog
          title="주소·QR"
          scroll
          onClose={() => setOpen(false)}
          footer={
            <>
              <Link className="scene-button scene-button--secondary scene-button--size-40" to={`/events/${eventId}/participants/setup`}>
                신청서 설정으로 가기
              </Link>
              <Button type="button" variant="primary" size={40} onClick={() => setOpen(false)}>
                닫기
              </Button>
            </>
          }
        >
          <dl className="address-sheet">
            <ApplyAddress eventId={eventId} />
            <ParticipantAddress eventId={eventId} />
          </dl>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

function ApplyAddress({ eventId }: { eventId: string }) {
  const forms = useQuery({
    queryKey: queryKeys.forms(eventId, 0),
    queryFn: () => listForms(eventId, { page: 0, size: 20 }),
    enabled: eventId.length > 0,
  });
  const [copied, setCopied] = useState<string | null>(null);
  const open = forms.data?.items.find((item) => item.acceptingApplications);
  const address = open ? `${window.location.origin}/apply/${eventId}/${open.formId}` : "";

  return (
    <div className="address-sheet__row">
      <dt>신청 주소</dt>
      <dd>
        {forms.isPending ? <p className="address-sheet__hint">불러오는 중이에요.</p> : null}
        {forms.isError ? (
          <>
            <p className="address-sheet__hint">불러오지 못했어요.</p>
            <div className="address-sheet__actions">
              <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(forms)}>
                다시 시도
              </Button>
            </div>
          </>
        ) : null}
        {forms.isSuccess && open ? (
          <>
            <span className="address-sheet__value" data-testid="apply-address">
              {address}
            </span>
            <p className="address-sheet__hint">이 주소를 보내면 참가자가 신청할 수 있어요.</p>
            {copied ? (
              <p className="address-sheet__hint" role="status">
                {copied}
              </p>
            ) : null}
            <div className="address-sheet__actions">
              <Button
                type="button"
                variant="secondary"
                size={40}
                aria-label="신청 주소 복사"
                onClick={() => {
                  void navigator.clipboard.writeText(address).then(
                    () => setCopied("복사했어요."),
                    () => setCopied("주소를 복사하지 못했어요."),
                  );
                }}
              >
                복사
              </Button>
            </div>
          </>
        ) : null}
        {forms.isSuccess && !open ? <p className="address-sheet__hint">신청을 열면 주소를 복사할 수 있어요.</p> : null}
      </dd>
    </div>
  );
}

/**
 * The event's one participant address (DEC-078 §8). Operators copy it, or its QR, into a group
 * chat. Participants come back here with name, phone and their six-digit number. The address has
 * no key in it.
 */
function ParticipantAddress({ eventId }: { eventId: string }) {
  const address = `${window.location.origin}/participate/${eventId}`;
  const [copied, setCopied] = useState<string | null>(null);
  const { size, d } = qrPath(address);

  async function copyQr() {
    try {
      const png = await qrPng(size, d);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setCopied("QR 그림을 복사했어요.");
    } catch {
      const png = await qrPng(size, d).catch(() => null);
      if (!png) {
        setCopied("QR을 복사하지 못했어요.");
        return;
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(png);
      link.download = "scene-participant-qr.png";
      link.click();
      URL.revokeObjectURL(link.href);
      setCopied("이 브라우저는 그림 복사를 막아서 QR을 파일로 받았어요.");
    }
  }

  return (
    <div className="address-sheet__row">
      <dt>참가자 주소</dt>
      <dd>
        <span className="address-sheet__value" data-testid="participant-address">
          {address}
        </span>
        <p className="address-sheet__hint">
          신청한 사람이 이 주소에서 이름, 전화번호, 직접 정한 숫자 6자리로 들어와요. 단체 대화방에 그대로 올려도 돼요.
        </p>
        <svg
          className="address-sheet__qr"
          role="img"
          aria-label="참가자 주소 QR"
          viewBox={`0 0 ${size} ${size}`}
          width={160}
          height={160}
          shapeRendering="crispEdges"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width={size} height={size} fill="#ffffff" />
          <path d={d} fill="#000000" />
        </svg>
        {copied ? (
          <p className="address-sheet__hint" role="status">
            {copied}
          </p>
        ) : null}
        <div className="address-sheet__actions">
          <Button
            type="button"
            variant="secondary"
            size={40}
            aria-label="참가자 주소 복사"
            onClick={() => {
              void navigator.clipboard.writeText(address).then(
                () => setCopied("주소를 복사했어요."),
                () => setCopied("주소를 복사하지 못했어요."),
              );
            }}
          >
            주소 복사
          </Button>
          <Button type="button" variant="secondary" size={40} onClick={() => void copyQr()}>
            QR 복사
          </Button>
        </div>
      </dd>
    </div>
  );
}

/** Draws the QR path on a canvas, 8 px per module, and returns a PNG. */
function qrPng(size: number, d: string): Promise<Blob> {
  const scale = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size * scale;
  canvas.height = size * scale;
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("no canvas"));
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scale, scale);
  context.fillStyle = "#000000";
  context.fill(new Path2D(d));
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no png"))), "image/png");
  });
}
