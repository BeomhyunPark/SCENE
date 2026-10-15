/** Names from `ErrorCode.java`, plus client-only network and uncoded failures. */
export const API_ERROR_CODES = [
  "AUTHENTICATION_REQUIRED",
  "PARTICIPANT_ACCESS_INVALID",
  "FORBIDDEN",
  "NOT_A_MEMBER",
  "OVERRIDE_REQUIRED",
  "RESOURCE_NOT_FOUND",
  "VALIDATION_FAILED",
  "PAGE_SIZE_EXCEEDED",
  "CONFLICT",
  "CONCURRENT_MODIFICATION",
  "INVALID_STATE_TRANSITION",
  "CONFIRMATION_REQUIRED",
  "EVENT_ARCHIVED",
  "EVENT_ENDED",
  "FORM_NOT_FOUND",
  "FORM_CLOSED",
  "APPLICATION_VALIDATION_FAILED",
  "INVITATION_REVOKED",
  "INVITATION_EMAIL_MISMATCH",
  "INVITATION_EXPIRED",
  "INVITATION_SUPERSEDED",
  "INVITATION_ALREADY_ACCEPTED",
  "INVITATION_NOT_FOUND",
  "RATE_LIMITED",
  "TRANSFER_NOT_PENDING",
  "TRANSFER_COMPLETED",
  "HANDOVER_NOT_ACCEPTED",
  "LAST_OWNER",
  "OWNER_ROLE_HELD",
  "RESPONSIBILITY",
  "TASK_VERSION_CONFLICT",
  "INVALID_TASK_STATE",
  "PERMISSION_OWNER_NOT_OVERRIDABLE",
  "PERMISSION_OWNER_ONLY",
  "PERMISSION_NOT_OVERRIDABLE",
  "NETWORK_ERROR",
  "UNEXPECTED",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

const KNOWN_CODES: ReadonlySet<string> = new Set(API_ERROR_CODES);

export type ApiFieldError = {
  field: string;
  code?: string;
  message?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly title?: string;
  /** Debug only. Screens must not display `detail`. */
  readonly detail?: string;
  readonly traceId?: string;
  readonly errors?: ApiFieldError[];
  readonly extensions: Record<string, unknown>;

  constructor(init: {
    status: number;
    code: ApiErrorCode;
    title?: string;
    detail?: string;
    traceId?: string;
    errors?: ApiFieldError[];
    extensions?: Record<string, unknown>;
  }) {
    super(init.code);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.title = init.title;
    this.detail = init.detail;
    this.traceId = init.traceId;
    this.errors = init.errors;
    this.extensions = init.extensions ?? {};
  }
}

export function isApiError(error: unknown, ...codes: ApiErrorCode[]): error is ApiError {
  if (!(error instanceof ApiError)) {
    return false;
  }
  return codes.length === 0 || codes.includes(error.code);
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && KNOWN_CODES.has(value);
}
