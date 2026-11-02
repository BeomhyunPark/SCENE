import { localAccounts } from "../localLogin";

export function LocalAccountsHint() {
  return (
    <div className="public-login__dev-hint">
      <p>개발 중에는 아래 로컬 계정 이메일로 들어가요. 비밀번호는 확인하지 않아요.</p>
      <ul>
        {localAccounts.map((account) => (
          <li key={account.email}>
            {account.email} · {account.user.displayName}
          </li>
        ))}
      </ul>
    </div>
  );
}
