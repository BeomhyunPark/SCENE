import { useLocation, useNavigate, type To } from "react-router";

/**
 * The applicant detail opens as a popup over the screen it was opened from (참가 현황 표, 신청 집계,
 * 현장 운영, 조 편성). The open application is in the address as `?applicant=<applicationId>`, so the
 * screen underneath keeps its filters, sorts and scroll, a refresh or a shared link reopens the same
 * popup, and the browser back button closes it.
 */
export const APPLICANT_PARAM = "applicant";

/** History state of an entry pushed by opening the popup; closing goes back to the entry before it. */
type OpenedState = { applicantDialog: true };

function withApplicant(search: string, applicationId: string | null): string {
  const params = new URLSearchParams(search);
  if (applicationId === null) params.delete(APPLICANT_PARAM);
  else params.set(APPLICANT_PARAM, applicationId);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function openedFromHere(state: unknown): boolean {
  return typeof state === "object" && state !== null && (state as Partial<OpenedState>).applicantDialog === true;
}

/** Where a link opens the popup: the same screen with `?applicant=` added, and the state that marks it. */
export function useApplicantLink() {
  const location = useLocation();
  const navigate = useNavigate();
  const state: OpenedState = { applicantDialog: true };
  function to(applicationId: string): To {
    return { pathname: location.pathname, search: withApplicant(location.search, applicationId) };
  }
  return {
    to,
    state,
    open(applicationId: string) {
      navigate(to(applicationId), { state });
    },
  };
}

/** The open application id and how to close the popup. */
export function useApplicantParam() {
  const location = useLocation();
  const navigate = useNavigate();
  const applicationId = new URLSearchParams(location.search).get(APPLICANT_PARAM);
  return {
    applicationId: applicationId && applicationId.trim() ? applicationId : null,
    close() {
      // Opened from this screen: going back restores the entry before it, scroll and all. A shared
      // link or a refresh has nothing of ours to go back to, so drop the parameter in place.
      if (openedFromHere(location.state)) navigate(-1);
      else navigate({ pathname: location.pathname, search: withApplicant(location.search, null) }, { replace: true });
    },
  };
}
