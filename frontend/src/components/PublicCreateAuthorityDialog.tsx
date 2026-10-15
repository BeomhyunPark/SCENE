import { useState } from "react";
import { Button } from "./Button";
import { PublicFlowDialog } from "./PublicFlowDialog";

type PublicCreateAuthorityDialogProps = {
  organizationName: string;
  onClose: () => void;
};

export function PublicCreateAuthorityDialog({
  organizationName,
  onClose,
}: PublicCreateAuthorityDialogProps) {
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) {
    return (
      <PublicFlowDialog
        eyebrow={organizationName}
        title="대표·운영 권한이 있다고 알려 주셨어요"
        wide
        onClose={onClose}
        footer={
          <>
            <Button type="button" variant="secondary" size={40} onClick={() => setConfirmed(false)}>
              다시 선택
            </Button>
            <Button type="button" variant="primary" size={40} onClick={onClose}>
              조직 만들기
            </Button>
          </>
        }
      >
        <p className="public-flow__copy">
          {"같은 이름의 조직 후보와 지역을 확인해 주세요.\n최종 생성하면 현재 계정이 첫 Owner가 돼요."}
        </p>
      </PublicFlowDialog>
    );
  }

  return (
    <PublicFlowDialog
      eyebrow={organizationName}
      title="조직을 만들 권한이 있나요?"
      wide
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" size={40} onClick={onClose}>
            등록 화면으로
          </Button>
          <Button type="button" variant="primary" size={40} onClick={() => setConfirmed(true)}>
            권한이 있어요
          </Button>
        </>
      }
    >
      <p className="public-flow__copy">
        {
          "이 조직을 대표하거나 생성·운영 권한을 받았는지 확인해 주세요.\nSCENE은 별도로 심사하지 않아요.\n권한이 있다고 알려 주면 만들 수 있어요."
        }
      </p>
    </PublicFlowDialog>
  );
}
