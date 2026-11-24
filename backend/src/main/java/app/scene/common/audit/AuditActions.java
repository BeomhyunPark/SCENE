package app.scene.common.audit;

/** Action names stored on {@code audit_logs.action}. Call sites use these constants. */
public final class AuditActions {

  public static final String EVENT_USER_PERMISSIONS_REPLACED = "EVENT_USER_PERMISSIONS_REPLACED";
  public static final String EVENT_USER_ROLE_CHANGED = "EVENT_USER_ROLE_CHANGED";
  public static final String EVENT_ACCESS_REVOKED = "EVENT_ACCESS_REVOKED";
  public static final String TASK_ASSIGNEE_CLEARED = "TASK_ASSIGNEE_CLEARED";
  public static final String EVENT_ACTIVATE = "EVENT_ACTIVATE";
  public static final String EVENT_END = "EVENT_END";
  public static final String EVENT_REOPEN = "EVENT_REOPEN";
  public static final String EVENT_ARCHIVE = "EVENT_ARCHIVE";
  public static final String EVENT_UNARCHIVE = "EVENT_UNARCHIVE";

  /** Details carry the new version only. The retrospective text is never audited. */
  public static final String EVENT_RETROSPECTIVE_UPDATED = "EVENT_RETROSPECTIVE_UPDATED";

  /**
   * Event participant settings changed (#452, DEC-083 §2). Details are {@code fields}, the changed
   * setting names, and the new {@code version}. Not written when nothing changed.
   */
  public static final String EVENT_PARTICIPANT_SETTINGS_UPDATED =
      "EVENT_PARTICIPANT_SETTINGS_UPDATED";

  /**
   * Operator values of one application were saved (#335, DEC-075). Details are {@code
   * applicationId}, the new {@code version} and the changed {@code fields}. The memo text is never
   * audited.
   */
  public static final String APPLICATION_OPERATION_UPDATED = "APPLICATION_OPERATION_UPDATED";

  /**
   * Check-in and cancel (#282). Details are {@code checkInId}, {@code participantId}, {@code
   * method} (null on cancel), and {@code reason} (null on check-in). No name or phone.
   */
  public static final String CHECKIN_CREATED = "CHECKIN_CREATED";

  public static final String CHECKIN_CANCELLED = "CHECKIN_CANCELLED";

  /**
   * Applicant CSV download (#233). Detail is {@code count}, the number of applicant rows. The event
   * and actor are the row's own columns. No answer, name or phone (DEC-055).
   */
  public static final String APPLICATIONS_EXPORTED = "APPLICATIONS_EXPORTED";

  /**
   * The applicant table sent phone answers (#308). Detail is {@code count}, the number of applicant
   * rows. No number or name. Stand-in for the {@code CONTACT_VIEW} privacy log until it is built.
   */
  public static final String APPLICANT_CONTACTS_VIEWED = "APPLICANT_CONTACTS_VIEWED";

  /**
   * Group publication (#300, DEC-072). Details are {@code publicationId}, {@code boardVersion},
   * {@code assignedCount}, {@code unassignedCount}, and {@code changedParticipantCount}. Not
   * written for {@code ALREADY_PUBLISHED}. No name or phone.
   */
  public static final String GROUPS_PUBLISHED = "GROUPS_PUBLISHED";

  /**
   * Schedule publication (#435, DEC-081). Details are {@code publicationId}, {@code boardVersion},
   * {@code added}, {@code changed}, {@code removed} (counts), {@code notify}, and {@code
   * notifiedCount}. Not written for {@code ALREADY_PUBLISHED}. Item edits are not audited.
   */
  public static final String SCHEDULE_PUBLISHED = "SCHEDULE_PUBLISHED";

  /**
   * Space invitation commands (#361, DEC-076). Rows carry the space and no event. Details are
   * {@code invitationId} and {@code role}; resend adds {@code previousInvitationId}; accept adds
   * {@code outcome} ({@code ACCEPTED} or {@code ALREADY_MEMBER}) and {@code membership} ({@code
   * CREATED}, {@code REACTIVATED} or {@code UNCHANGED}). No email, token, hash or link.
   */
  public static final String SPACE_INVITATION_CREATED = "SPACE_INVITATION_CREATED";

  public static final String SPACE_INVITATION_RESENT = "SPACE_INVITATION_RESENT";

  public static final String SPACE_INVITATION_REVOKED = "SPACE_INVITATION_REVOKED";

  public static final String SPACE_INVITATION_ACCEPTED = "SPACE_INVITATION_ACCEPTED";

  /**
   * Notices (DEC-082, #434). {@code NOTICE_PUBLISHED} details are {@code noticeId}, {@code
   * version}, {@code audienceTypes}, {@code important}, {@code notifiedCount}; {@code
   * NOTICE_UPDATED} (a published notice's content changed) {@code noticeId}, {@code version},
   * {@code fields}, {@code notify}, {@code notifiedCount}; archive and unarchive {@code noticeId}
   * and {@code version}. Never the title or body.
   */
  public static final String NOTICE_PUBLISHED = "NOTICE_PUBLISHED";

  public static final String NOTICE_UPDATED = "NOTICE_UPDATED";

  public static final String NOTICE_ARCHIVED = "NOTICE_ARCHIVED";

  public static final String NOTICE_UNARCHIVED = "NOTICE_UNARCHIVED";

  public static final String PARTICIPANT_PIN_RESET = "PARTICIPANT_PIN_RESET";

  /** An operator withdrew an application (DEC-084). Details carry ids and flags, not the reason. */
  public static final String APPLICATION_WITHDRAWN = "APPLICATION_WITHDRAWN";

  /** An operator restored a withdrawn application (DEC-084). */
  public static final String APPLICATION_RESTORED = "APPLICATION_RESTORED";

  private AuditActions() {}
}
