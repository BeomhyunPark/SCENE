import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { isApiError } from "../api/errors";
import { queryKeys } from "../api/queryKeys";
import { getMe, login, logout } from "../api/session";
import { localUsers } from "../mocks/fixtures/seed";
import { devLoginEnabled } from "../devLogin";
import { Button } from "./Button";
import "./DevLoginPanel.css";

const CUSTOM = "custom";

export function DevLoginPanel() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: getMe,
    enabled: false,
  });
  const [userId, setUserId] = useState<string>(localUsers[0].userId);
  const [customId, setCustomId] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  if (!devLoginEnabled()) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const id = userId === CUSTOM ? customId.trim() : userId;
    try {
      await login({ userId: id, email: email.trim() || undefined });
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      const next = params.get("next");
      navigate(next && next.startsWith("/") && !next.startsWith("//") ? next : "/events");
    } catch (caught) {
      setError(
        isApiError(caught, "AUTHENTICATION_REQUIRED")
          ? "이 사용자를 찾지 못했어요. id를 확인해 주세요."
          : "저장하지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    setPending(true);
    try {
      await logout();
      queryClient.clear();
      setError("");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="dev-login">
      <h2 className="dev-login__title">개발용 로그인</h2>
      <p className="dev-login__support">비밀번호 없이 시드 사용자로 들어가요. 개발 중에만 보여요.</p>
      {me.data ? (
        <Button type="button" variant="secondary" size={40} loading={pending} onClick={() => void signOut()}>
          로그아웃
        </Button>
      ) : (
        <form className="dev-login__form" onSubmit={(event) => void submit(event)}>
          <label className="dev-login__label" htmlFor="dev-user">
            시드 사용자
          </label>
          <select id="dev-user" value={userId} onChange={(event) => setUserId(event.target.value)}>
            {localUsers.map((user) => (
              <option key={user.userId} value={user.userId}>
                {user.displayName}
              </option>
            ))}
            <option value={CUSTOM}>직접 입력</option>
          </select>
          {userId === CUSTOM ? (
            <input
              aria-label="사용자 id"
              value={customId}
              placeholder="사용자 id"
              onChange={(event) => setCustomId(event.target.value)}
            />
          ) : null}
          <label className="dev-login__label" htmlFor="dev-email">
            이메일 (선택)
          </label>
          <input
            id="dev-email"
            value={email}
            placeholder="local-invite@example.com"
            onChange={(event) => setEmail(event.target.value)}
          />
          {error ? (
            <p className="dev-login__error" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" size={40} loading={pending}>
            들어가기
          </Button>
        </form>
      )}
    </section>
  );
}
