import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";
import { isApiError } from "../api/errors";
import { changeParticipantPin, getParticipantMe, logoutParticipant, signInParticipant } from "../api/participant";
import { reloadQuery } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { Button } from "./Button";
import { ParticipantCheckIn } from "./ParticipantCheckIn";
import { ParticipantFrame } from "./ParticipantFrame";
import { ParticipantGroup } from "./ParticipantGroup";
import { PinFields } from "./apply/PinFields";
import { pinInput, pinProblem } from "./apply/pinRules";

/**
 * The event's one participant address (DEC-078 §8). Without a session the person signs in with
 * name, phone and the six-digit number they chose; right after applying they are already in. A
 * session opened with an operator's temporary number must set a new number first.
 */
export function ParticipantEnter() {
  const { eventId = "" } = useParams();
  const [left, setLeft] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: queryKeys.participantMe(eventId),
    queryFn: ({ signal }) => getParticipantMe(signal),
    retry: false,
  });

  if (me.isPending) {
    return (
      <ParticipantFrame title="들어가는 중이에요">
        <p className="participant-gate__body">불러오는 중이에요.</p>
      </ParticipantFrame>
    );
  }
  if (me.isError) {
    if (isApiError(me.error, "AUTHENTICATION_REQUIRED")) {
      return (
        <SignIn
          eventId={eventId}
          left={left}
          onSignedIn={() => {
            setLeft(false);
            void queryClient.invalidateQueries({ queryKey: queryKeys.participantMe(eventId) });
          }}
        />
      );
    }
    return (
      <ParticipantFrame title="불러오지 못했어요">
        <Button type="button" variant="secondary" size={40} onClick={() => reloadQuery(me)}>
          다시 시도
        </Button>
      </ParticipantFrame>
    );
  }
  if (me.data.pinChangeRequired) {
    return (
      <NewPin
        name={me.data.name}
        onDone={() => void queryClient.invalidateQueries({ queryKey: queryKeys.participantMe(eventId) })}
      />
    );
  }

  const name = me.data.name.trim();
  return (
    <ParticipantFrame title={name.length > 0 ? `${name}님, 참가 신청이 됐어요.` : "참가 신청이 됐어요."}>
      <ParticipantCheckIn eventId={eventId} />
      <ParticipantGroup eventId={eventId} name={name} />
      {logoutError ? <p className="participant-gate__error">나가지 못했어요. 잠시 후 다시 시도해 주세요.</p> : null}
      <Button
        type="button"
        variant="secondary"
        size={40}
        onClick={() => {
          setLogoutError(false);
          void logoutParticipant()
            .then(() => {
              queryClient.removeQueries({ queryKey: queryKeys.participantCheckIn(eventId) });
              queryClient.removeQueries({ queryKey: queryKeys.participantGroup(eventId) });
              setLeft(true);
              return queryClient.resetQueries({ queryKey: queryKeys.participantMe(eventId) });
            })
            .catch(() => setLogoutError(true));
        }}
      >
        로그아웃
      </Button>
    </ParticipantFrame>
  );
}

function SignIn({ eventId, left, onSignedIn }: { eventId: string; left: boolean; onSignedIn: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [missing, setMissing] = useState(false);
  const signIn = useMutation({
    mutationFn: () => signInParticipant(eventId, { name: name.trim(), phone: phone.trim(), pin }),
    onSuccess: onSignedIn,
  });
  const ready = name.trim().length > 0 && phone.replace(/\D/g, "").length >= 4 && pin.length === 6;

  return (
    <ParticipantFrame title={left ? "나갔어요" : "내 신청 보기"}>
      <p className="participant-gate__body">신청할 때 적은 이름과 전화번호, 직접 정한 숫자 6자리를 넣어 주세요.</p>
      <form
        className="participant-gate__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (signIn.isPending) return;
          if (!ready) {
            setMissing(true);
            return;
          }
          signIn.mutate();
        }}
      >
        <div className="participant-gate__field">
          <label className="participant-gate__label" htmlFor="enter-name">
            이름
          </label>
          <input
            id="enter-name"
            className="participant-gate__input"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="participant-gate__field">
          <label className="participant-gate__label" htmlFor="enter-phone">
            전화번호
          </label>
          <input
            id="enter-phone"
            className="participant-gate__input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
        <div className="participant-gate__field">
          <label className="participant-gate__label" htmlFor="enter-pin">
            숫자 6자리
          </label>
          <input
            id="enter-pin"
            className="participant-gate__input"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={6}
            value={pin}
            onChange={(event) => setPin(pinInput(event.target.value))}
          />
        </div>
        {missing && !ready ? <p className="participant-gate__error">이름, 전화번호, 숫자 6자리를 모두 넣어 주세요.</p> : null}
        {signIn.isError ? (
          <p className="participant-gate__error" role="alert">
            {signInFailure(signIn.error)}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size={40} loading={signIn.isPending}>
          들어가기
        </Button>
      </form>
      <p className="participant-gate__help">숫자 6자리를 잊었다면 운영진에게 초기화를 부탁해 주세요. 임시 번호를 알려 줘요.</p>
    </ParticipantFrame>
  );
}

function NewPin({ name, onDone }: { name: string; onDone: () => void }) {
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [tried, setTried] = useState(false);
  const change = useMutation({
    mutationFn: () => changeParticipantPin({ newPin: pin }),
    onSuccess: onDone,
  });
  // The server does not send the phone, so the phone-digits rule is checked there.
  const pinError = pinProblem(pin, "");
  const againError = pinAgain !== pin ? "두 번호가 달라요." : null;
  const trimmed = name.trim();

  return (
    <ParticipantFrame title="새 숫자 6자리를 정해 주세요">
      <p className="participant-gate__body">
        {trimmed.length > 0 ? `${trimmed}님, ` : ""}임시 번호로 들어왔어요. 다음부터 쓸 번호를 정해야 계속할 수 있어요.
      </p>
      <form
        className="participant-gate__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (change.isPending) return;
          setTried(true);
          if (pinError || againError) return;
          change.mutate();
        }}
      >
        <PinFields
          title="새 숫자 6자리"
          intro="이름, 전화번호와 함께 다시 들어올 때 써요."
          pin={pin}
          pinAgain={pinAgain}
          pinError={tried || pin.length === 6 ? pinError : null}
          againError={tried || pinAgain.length === 6 ? againError : null}
          onPin={setPin}
          onPinAgain={setPinAgain}
        />
        {change.isError ? (
          <p className="participant-gate__error" role="alert">
            {isApiError(change.error, "PARTICIPANT_PIN_WEAK")
              ? "쓸 수 없는 번호예요. 다른 숫자 6자리를 정해 주세요."
              : "저장하지 못했어요. 잠시 후 다시 시도해 주세요."}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size={40} loading={change.isPending}>
          번호 정하기
        </Button>
      </form>
    </ParticipantFrame>
  );
}

function signInFailure(error: unknown): string {
  if (isApiError(error, "PARTICIPANT_LOGIN_FAILED")) return "이름, 전화번호, 숫자 6자리를 다시 확인해 주세요.";
  if (isApiError(error, "PARTICIPANT_LOGIN_LOCKED")) {
    const seconds = Number(error.extensions.retryAfterSeconds);
    const minutes = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds / 60) : 15;
    return `여러 번 틀려서 잠겼어요. ${minutes}분 뒤에 다시 해 주세요. 번호를 잊었다면 운영진에게 초기화를 부탁해 주세요.`;
  }
  if (isApiError(error, "RATE_LIMITED")) return "시도가 너무 많아요. 잠시 후 다시 해 주세요.";
  if (isApiError(error, "RESOURCE_NOT_FOUND")) return "행사를 찾을 수 없어요. 주소를 다시 확인해 주세요.";
  return "들어가지 못했어요. 잠시 후 다시 시도해 주세요.";
}
