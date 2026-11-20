package app.scene.event.notification.param;

import app.scene.event.notification.NotificationDraft;
import app.scene.event.notification.NotificationRecipient;
import app.scene.event.notification.RecipientKind;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * SQL values for {@code NotificationMapper}. A recipient scope is space, event, and either {@code
 * participantId} or {@code userId}; the other one is null.
 */
public final class NotificationParam {

  private final UUID spaceId;
  private final UUID eventId;
  private RecipientKind recipientKind;
  private UUID participantId;
  private UUID userId;
  private List<UUID> ids = List.of();
  private NotificationDraft draft;
  private String targetType;
  private UUID targetId;
  private Long before;
  private Long upToSeq;
  private int limit;
  private Instant at;

  private NotificationParam(UUID spaceId, UUID eventId) {
    this.spaceId = spaceId;
    this.eventId = eventId;
  }

  public static NotificationParam of(UUID spaceId, UUID eventId) {
    return new NotificationParam(spaceId, eventId);
  }

  public static NotificationParam of(NotificationRecipient recipient) {
    NotificationParam param = new NotificationParam(recipient.spaceId(), recipient.eventId());
    param.recipientKind = recipient.kind();
    if (recipient.kind() == RecipientKind.PARTICIPANT) {
      param.participantId = recipient.id();
    } else {
      param.userId = recipient.id();
    }
    return param;
  }

  /** Recipients for an insert: {@code ids} are participant or user ids by {@code kind}. */
  public NotificationParam recipients(RecipientKind kind, Collection<UUID> recipientIds) {
    this.recipientKind = kind;
    this.ids = List.copyOf(recipientIds);
    return this;
  }

  public NotificationParam ids(Collection<UUID> notificationIds) {
    this.ids = List.copyOf(notificationIds);
    return this;
  }

  public NotificationParam draft(NotificationDraft draft) {
    this.draft = draft;
    return this;
  }

  public NotificationParam target(String type, UUID id) {
    this.targetType = type;
    this.targetId = id;
    return this;
  }

  public NotificationParam before(Long before) {
    this.before = before;
    return this;
  }

  public NotificationParam upToSeq(Long upToSeq) {
    this.upToSeq = upToSeq;
    return this;
  }

  public NotificationParam limit(int limit) {
    this.limit = limit;
    return this;
  }

  public NotificationParam at(Instant at) {
    this.at = at;
    return this;
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public String getRecipientKind() {
    return recipientKind == null ? null : recipientKind.name();
  }

  public UUID getParticipantId() {
    return participantId;
  }

  public UUID getUserId() {
    return userId;
  }

  public List<UUID> getIds() {
    return ids;
  }

  public String getKind() {
    return draft.kind();
  }

  public String getDraftTargetType() {
    return draft.targetType();
  }

  public UUID getDraftTargetId() {
    return draft.targetId();
  }

  public String getTitle() {
    return draft.title();
  }

  public String getBody() {
    return draft.body();
  }

  public boolean isImportant() {
    return draft.important();
  }

  public String getTargetType() {
    return targetType;
  }

  public UUID getTargetId() {
    return targetId;
  }

  public Long getBefore() {
    return before;
  }

  public Long getUpToSeq() {
    return upToSeq;
  }

  public int getLimit() {
    return limit;
  }

  public Instant getAt() {
    return at;
  }
}
