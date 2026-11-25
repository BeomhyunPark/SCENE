package app.scene.event.application;

import app.scene.common.permission.Permission;
import app.scene.event.notification.NotificationDraft;
import app.scene.event.notification.Notifications;
import app.scene.event.notification.OperatorRecipients;
import app.scene.event.participant.ParticipantIdentity;
import app.scene.event.participant.ParticipantRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Operator notifications about one participant's application (DEC-080 §7.2, DEC-084 §7; I3 #436).
 * Everything runs in the caller's transaction, after the revision or status change is stored, so a
 * rolled back change leaves no notification.
 *
 * <ul>
 *   <li>{@link #revised}: the participant edited ({@code PUT /participant/application}).
 *   <li>{@link #resubmitted}: the same phone applied again with the right number and it became an
 *       edit (public submit {@code 200}).
 *   <li>{@link #operatorRevised}: an operator edited for the participant (DEC-088). The participant
 *       gets {@code APPLICATION_UPDATED_BY_OPERATOR}; the other operators get {@code
 *       APPLICATION_REVISED} with an operator title. The operator who edited gets nothing.
 *   <li>{@link #operatorAdded}: an operator added a participant; the other operators get {@code
 *       APPLICATION_ADDED}.
 *   <li>{@link #onStatusChanged}: {@link ApplicationStatusChanged}, published by {@code
 *       ApplicationStatusChanges.record} in the withdraw, restore and re-application transaction,
 *       makes {@code APPLICATION_CANCELLED} or {@code APPLICATION_RESTORED}. A plain {@code
 *       EventListener} runs in the publisher's transaction, so a rollback removes the row too.
 * </ul>
 *
 * <p><b>Recipients</b> are fixed now: active operators of the event with an effective {@code
 * PARTICIPANT_READ} ({@link OperatorRecipients#withPermission}, DEC-080 decision 1). By default
 * that is OWNER and MANAGER; STAFF only with a GRANT; a REVOKE takes a person out. The operator who
 * withdrew or restored does not receive it.
 *
 * <p><b>Text</b> is the participant's name and the changed question titles only. Answers, phone
 * numbers, the six-digit number and the withdraw reason are never in it.
 *
 * <p><b>Target</b> is {@code APPLICATION} with the current application id. A revision is a new
 * {@code applications} row, so the earlier notifications about any of the participant's rows are
 * moved to the current one first ({@link Notifications#retarget}); then the unread one of the same
 * kind merges and five edits read as one line with {@code count} 5. A tap always opens the current
 * application, whose revision list shows every change.
 */
@Component
public class ApplicationNotices {

  public static final String REVISED = "APPLICATION_REVISED";
  public static final String RESUBMITTED = "APPLICATION_RESUBMITTED";
  public static final String CANCELLED = "APPLICATION_CANCELLED";
  public static final String RESTORED = "APPLICATION_RESTORED";
  public static final String ADDED = "APPLICATION_ADDED";
  public static final String UPDATED_BY_OPERATOR = "APPLICATION_UPDATED_BY_OPERATOR";
  public static final String TARGET = "APPLICATION";

  private static final String LABEL_SEPARATOR = ", ";

  private final Notifications notifications;
  private final OperatorRecipients recipients;
  private final ApplicationRevisions revisions;
  private final ParticipantRepository participants;

  public ApplicationNotices(
      Notifications notifications,
      OperatorRecipients recipients,
      ApplicationRevisions revisions,
      ParticipantRepository participants) {
    this.notifications = notifications;
    this.recipients = recipients;
    this.revisions = revisions;
    this.participants = participants;
  }

  /** The participant edited their application ({@code PUT /participant/application}). */
  @Transactional(propagation = Propagation.MANDATORY)
  public int revised(UUID spaceId, UUID eventId, ApplicationRevisions.Result result) {
    return changed(spaceId, eventId, result, REVISED, "님이 신청 내역을 수정했어요");
  }

  /** The same phone applied again with the right number and it became an edit. */
  @Transactional(propagation = Propagation.MANDATORY)
  public int resubmitted(UUID spaceId, UUID eventId, ApplicationRevisions.Result result) {
    return changed(spaceId, eventId, result, RESUBMITTED, "님이 다시 신청해 내용을 바꿨어요");
  }

  /**
   * An operator edited the participant's application (DEC-088 §5–6), in the edit's transaction.
   * Returns rows made for operators and the participant together.
   */
  @Transactional(propagation = Propagation.MANDATORY)
  public int operatorRevised(
      UUID spaceId,
      UUID eventId,
      UUID participantId,
      ApplicationRevisions.Result result,
      UUID operatorUserId) {
    if (!result.revised()) {
      return 0;
    }
    pointAtCurrent(spaceId, eventId, result.applicationId());
    String labels = String.join(LABEL_SEPARATOR, result.changedLabels());
    // DEC-088 결정 대기 6 (사용자 2026-11-25): "신청 내역을 수정했어요", 누가 고쳤는지 드러나게.
    String editor =
        revisions.revisorNames(spaceId, eventId, participantId).get(result.applicationId());
    int made =
        notifications.toParticipants(
            spaceId,
            eventId,
            List.of(participantId),
            new NotificationDraft(
                UPDATED_BY_OPERATOR,
                TARGET,
                result.applicationId(),
                "운영자가 신청 내역을 수정했어요",
                labels,
                false));
    return made
        + send(
            spaceId,
            eventId,
            operatorUserId,
            new NotificationDraft(
                REVISED,
                TARGET,
                result.applicationId(),
                operatorDisplay(editor) + "님이 " + display(result.name()) + "님의 신청 내역을 수정했어요",
                labels,
                false));
  }

  /** An operator added a participant (DEC-088 §6). The operator who added gets nothing. */
  @Transactional(propagation = Propagation.MANDATORY)
  public int operatorAdded(
      UUID spaceId, UUID eventId, UUID applicationId, String name, UUID operatorUserId) {
    return send(
        spaceId,
        eventId,
        operatorUserId,
        new NotificationDraft(
            ADDED, TARGET, applicationId, display(name) + "님을 운영자가 직접 추가했어요", null, false));
  }

  /** DEC-084 §7: withdraw, operator restore, and a withdrawn participant's re-application. */
  @EventListener
  @Transactional(propagation = Propagation.MANDATORY)
  public void onStatusChanged(ApplicationStatusChanged change) {
    String name =
        participants
            .findById(change.spaceId(), change.eventId(), change.participantId())
            .map(ParticipantIdentity::name)
            .orElse(null);
    if (ApplicationStatusChanged.WITHDRAWN.equals(change.action())) {
      cancelled(
          change.spaceId(), change.eventId(), change.applicationId(), name, change.actorUserId());
      return;
    }
    if (!ApplicationStatusChanged.RESTORED.equals(change.action())) {
      return;
    }
    pointAtCurrent(change.spaceId(), change.eventId(), change.applicationId());
    boolean byParticipant = ApplicationStatusChanged.BY_PARTICIPANT.equals(change.actorKind());
    send(
        change.spaceId(),
        change.eventId(),
        change.actorUserId(),
        new NotificationDraft(
            RESTORED,
            TARGET,
            change.applicationId(),
            display(name) + (byParticipant ? "님이 취소된 신청으로 다시 신청했어요" : "님의 신청 취소를 되돌렸어요"),
            null,
            false));
  }

  /**
   * The application was cancelled (A7, DEC-084). {@link #onStatusChanged} calls it for an operator
   * withdraw; a participant's own cancel (DEC-084 §10, later) goes through the same event with
   * {@code actorUserId} null. {@code cancelledByUserId} does not receive it.
   */
  @Transactional(propagation = Propagation.MANDATORY)
  public int cancelled(
      UUID spaceId, UUID eventId, UUID applicationId, String name, UUID cancelledByUserId) {
    pointAtCurrent(spaceId, eventId, applicationId);
    return send(
        spaceId,
        eventId,
        cancelledByUserId,
        new NotificationDraft(
            CANCELLED, TARGET, applicationId, display(name) + "님의 신청이 취소됐어요", null, true));
  }

  private int changed(
      UUID spaceId, UUID eventId, ApplicationRevisions.Result result, String kind, String suffix) {
    if (!result.revised()) {
      return 0;
    }
    pointAtCurrent(spaceId, eventId, result.applicationId());
    // The participant made this change, so no operator is left out as its maker.
    return send(
        spaceId,
        eventId,
        null,
        new NotificationDraft(
            kind,
            TARGET,
            result.applicationId(),
            display(result.name()) + suffix,
            String.join(LABEL_SEPARATOR, result.changedLabels()),
            false));
  }

  /** Every notification about the participant's earlier rows now opens {@code current}. */
  private void pointAtCurrent(UUID spaceId, UUID eventId, UUID current) {
    List<UUID> rows = new ArrayList<>();
    for (ApplicationRevisionRow row : revisions.listByApplication(spaceId, eventId, current)) {
      rows.add(row.applicationId());
    }
    notifications.retarget(spaceId, eventId, TARGET, rows, current);
  }

  private int send(UUID spaceId, UUID eventId, UUID except, NotificationDraft draft) {
    List<UUID> to =
        recipients.withPermission(spaceId, eventId, Permission.PARTICIPANT_READ, except);
    return to.isEmpty() ? 0 : notifications.toOperators(spaceId, eventId, to, draft);
  }

  private static String operatorDisplay(String name) {
    return name == null || name.isBlank() ? "운영자" : name.strip();
  }

  private static String display(String name) {
    return name == null || name.isBlank() ? "참가자" : name.strip();
  }
}
