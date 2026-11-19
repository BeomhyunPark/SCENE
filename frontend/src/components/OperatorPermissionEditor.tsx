import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isApiError } from "../api/errors";
import { getMyPermissions, replaceOperatorPermissions, type EventOperator, type PermissionBody } from "../api/operators";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { operatorRoleLabel } from "./eventFormat";
import {
  PERMISSION_GROUPS,
  isOn,
  overrideSummary,
  sameOverrides,
  sourceLabel,
  sourceOf,
  toggled,
  type PermissionState,
} from "./operatorPermissions";
import "./OperatorPermissionEditor.css";

/** One operator's permissions for the event OWNER (DEC-079). Shared by the row summary and the dialog. */
function useOperatorPermissions(eventId: string, userId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.permissions(eventId, userId),
    queryFn: () => getMyPermissions(eventId, userId),
    enabled,
  });
}

/** Row line: role default only, or how many listed keys were added or removed for this person. */
export function PermissionSummary({ eventId, userId }: { eventId: string; userId: string }) {
  const permissions = useOperatorPermissions(eventId, userId, true);
  if (!permissions.data) return null;
  return <span className="operator-permissions__summary">{overrideSummary(permissions.data)}</span>;
}

/**
 * The event OWNER turns individual permissions on and off. Saving sends the whole override set:
 * the stored overrides with only the changed listed keys replaced. An archived event allows
 * turning off only, like the server's EVENT_ARCHIVED rule (DEC-063).
 */
export function OperatorPermissionDialog({
  eventId,
  target,
  archived,
  onClose,
  onSaved,
}: {
  eventId: string;
  target: EventOperator;
  archived: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const permissions = useOperatorPermissions(eventId, target.userId, true);
  const [draft, setDraft] = useState<PermissionState["overrides"] | null>(null);
  const [alert, setAlert] = useState("");

  const save = useMutation({
    mutationFn: (overrides: PermissionState["overrides"]) =>
      replaceOperatorPermissions(eventId, target.userId, overrides),
    onSuccess: (saved: PermissionBody) => {
      queryClient.setQueryData(queryKeys.permissions(eventId, target.userId), saved);
      onSaved(`${target.displayName}님의 권한을 저장했어요.`);
    },
    onError: (caught) => {
      if (isApiError(caught, "EVENT_ARCHIVED")) setAlert("보관된 행사에서는 권한을 넓힐 수 없어요. 끄기만 할 수 있어요.");
      else if (isApiError(caught, "RESOURCE_NOT_FOUND")) setAlert(`${target.displayName}님은 이미 이 행사의 운영자가 아니에요.`);
      else if (isApiError(caught, "FORBIDDEN") || isApiError(caught, "NOT_A_MEMBER"))
        setAlert("권한을 바꿀 권한이 없어요. 행사 Owner만 바꿀 수 있어요.");
      else if (
        isApiError(caught, "PERMISSION_OWNER_NOT_OVERRIDABLE") ||
        isApiError(caught, "PERMISSION_OWNER_ONLY") ||
        isApiError(caught, "PERMISSION_NOT_OVERRIDABLE")
      )
        setAlert("바꿀 수 없는 권한이 들어 있어요. 화면을 새로 불러와 주세요.");
      else setAlert("저장하지 못했어요. 다시 시도해 주세요.");
      void queryClient.invalidateQueries({ queryKey: queryKeys.permissions(eventId, target.userId) });
    },
  });

  const loaded = permissions.data;
  const current: PermissionState | null = loaded
    ? { roleDefaults: loaded.roleDefaults, overrides: draft ?? loaded.overrides }
    : null;
  const changed = Boolean(loaded && current && !sameOverrides(current.overrides, loaded.overrides));
  const roleLabel = operatorRoleLabel(target.role);

  function close() {
    if (!save.isPending) onClose();
  }

  return (
    <ConfirmDialog
      title={`${target.displayName}님의 권한`}
      onClose={close}
      scroll
      footer={
        <>
          <Button type="button" variant="secondary" size={48} disabled={save.isPending} onClick={close}>
            돌아가기
          </Button>
          <Button
            type="button"
            variant="primary"
            size={48}
            loading={save.isPending}
            disabled={!changed || save.isPending}
            onClick={() => current && save.mutate(current.overrides)}
          >
            저장
          </Button>
        </>
      }
    >
      <p>
        {roleLabel} 역할 기본 권한에 더하거나 뺄 수 있어요. 저장하면 이 사람에게 바로 적용돼요.
      </p>
      {archived ? <p>보관된 행사에서는 권한을 끄기만 할 수 있어요.</p> : null}
      {permissions.isPending ? <p>불러오는 중이에요.</p> : null}
      {permissions.isError ? (
        <>
          <p>권한을 불러오지 못했어요.</p>
          <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(permissions)}>
            다시 시도
          </Button>
        </>
      ) : null}
      {current ? (
        <div className="operator-permissions">
          {PERMISSION_GROUPS.map((group) => (
            <fieldset key={group.title} className="operator-permissions__group">
              <legend>{group.title}</legend>
              {group.items.map((item) => {
                const on = isOn(current, item.key);
                const source = sourceOf(current, item.key);
                const tag = sourceLabel(source);
                const id = `permission-${item.key}`;
                return (
                  <div key={item.key} className="operator-permissions__item">
                    <input
                      id={id}
                      type="checkbox"
                      checked={on}
                      disabled={save.isPending || (archived && !on)}
                      aria-describedby={`${id}-hint`}
                      onChange={(change) => {
                        setAlert("");
                        setDraft(toggled(current, item.key, change.target.checked));
                      }}
                    />
                    <label htmlFor={id} className="operator-permissions__label">
                      {item.label}
                    </label>
                    {tag ? (
                      <span className={`operator-permissions__tag operator-permissions__tag--${source}`}>{tag}</span>
                    ) : null}
                    <span id={`${id}-hint`} className="operator-permissions__hint">
                      {item.hint}
                    </span>
                  </div>
                );
              })}
            </fieldset>
          ))}
          <p className="operator-permissions__fixed">
            행사 보기는 항상 켜져 있어요. 행사 상태 바꾸기와 운영 멤버 관리는 행사 Owner만 해요.
          </p>
        </div>
      ) : null}
      {alert ? (
        <p className="event-home__error" role="alert">
          {alert}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}
