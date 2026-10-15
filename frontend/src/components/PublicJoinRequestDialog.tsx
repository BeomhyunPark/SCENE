import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "./Button";
import { PublicFlowDialog } from "./PublicFlowDialog";

type PublicJoinRequestDialogProps = {
  organizationName: string;
  onClose: () => void;
};

export function PublicJoinRequestDialog({ organizationName, onClose }: PublicJoinRequestDialogProps) {
  const navigate = useNavigate();
  const [sent, setSent] = useState(false);

  function openPending() {
    navigate("/join-pending", { state: { organizationName } });
  }

  if (sent) {
    return (
      <PublicFlowDialog
        title="가입 요청을 보냈어요"
        onClose={onClose}
        footer={
          <Button type="button" variant="primary" size={40} onClick={openPending}>
            확인
          </Button>
        }
      >
        <p className="public-flow__copy">관리자의 승인을 기다려 주세요.</p>
        <p className="public-flow__status">승인 대기</p>
      </PublicFlowDialog>
    );
  }

  return (
    <PublicFlowDialog
      title="이 교회·단체에 가입을 요청할까요?"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" size={40} onClick={onClose}>
            취소
          </Button>
          <Button type="button" variant="primary" size={40} onClick={() => setSent(true)}>
            가입 요청
          </Button>
        </>
      }
    >
      <p className="public-flow__copy">{organizationName}에 운영자 가입 요청을 보내요.</p>
    </PublicFlowDialog>
  );
}
