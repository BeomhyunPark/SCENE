package app.scene.event.participantsettings;

import app.scene.common.audit.AuditActions;
import app.scene.common.audit.AuditLogRepository;
import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.event.feed.FeedArea;
import app.scene.event.feed.ParticipantFeedVersions;
import app.scene.event.lifecycle.EventAccessGate;
import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.lifecycle.EventRow;
import app.scene.space.EventUserPermissionRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * Event participant settings (DEC-083 §2, #452). Read needs effective {@code EVENT_READ} or an
 * active space owner or admin. Write needs effective {@code EVENT_UPDATE} and an event that is not
 * ARCHIVED. The order is 404 → 403 → 400 → 409 state → 409 version. A write that changes a value
 * stores the next version, raises {@code participant_feed_versions.groups} and writes audit {@code
 * EVENT_PARTICIPANT_SETTINGS_UPDATED} ({@code fields}, {@code version}) in one transaction. A write
 * that changes nothing stores nothing and returns the stored settings.
 */
@Service
public class ParticipantSettingsService {

  private static final String ARCHIVED = "ARCHIVED";
  private static final String ROSTER = "groupRosterVisibleToMembers";

  private final EventAccessGate gate;
  private final EventRepository events;
  private final ParticipantSettingsRepository settings;
  private final EventUserPermissionRepository permissions;
  private final AuditLogRepository auditLogs;
  private final ParticipantFeedVersions feedVersions;
  private final Clock clock;

  public ParticipantSettingsService(
      EventAccessGate gate,
      EventRepository events,
      ParticipantSettingsRepository settings,
      EventUserPermissionRepository permissions,
      AuditLogRepository auditLogs,
      ParticipantFeedVersions feedVersions,
      Clock clock) {
    this.gate = gate;
    this.events = events;
    this.settings = settings;
    this.permissions = permissions;
    this.auditLogs = auditLogs;
    this.feedVersions = feedVersions;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public ParticipantSettings read(UUID actorId, UUID eventId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!allows(opened, actorId, Permission.EVENT_READ) && !opened.membership().seesEveryEvent()) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    return stored(opened.location().spaceId(), eventId);
  }

  @Transactional
  public ParticipantSettings write(UUID actorId, UUID eventId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!allows(opened, actorId, Permission.EVENT_UPDATE)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    boolean rosterVisible = requiredBoolean(body, ROSTER);
    int expectedVersion = requiredVersion(body);
    UUID spaceId = opened.location().spaceId();
    EventRow locked = events.getForUpdate(spaceId, eventId);
    if (ARCHIVED.equals(locked.lifecycleStatus())) {
      throw new SceneException(ErrorCode.EVENT_ARCHIVED);
    }
    ParticipantSettings current = stored(spaceId, eventId);
    if (current.version() != expectedVersion) {
      throw new SceneException(
          ErrorCode.CONCURRENT_MODIFICATION, Map.of("version", current.version()));
    }
    if (current.groupRosterVisibleToMembers() == rosterVisible) {
      return current;
    }
    Instant now = clock.instant();
    if (!settings.write(spaceId, eventId, rosterVisible, expectedVersion, actorId, now)) {
      int version = settings.find(spaceId, eventId).map(ParticipantSettingsRow::version).orElse(0);
      throw new SceneException(ErrorCode.CONCURRENT_MODIFICATION, Map.of("version", version));
    }
    int version = expectedVersion + 1;
    // DEC-080 §4: participants reload their group card; same transaction as the write.
    feedVersions.bump(spaceId, eventId, FeedArea.GROUPS);
    auditLogs.save(
        spaceId,
        eventId,
        actorId,
        AuditActions.EVENT_PARTICIPANT_SETTINGS_UPDATED,
        "{\"fields\":[\"" + ROSTER + "\"],\"version\":" + version + "}",
        now);
    return stored(spaceId, eventId);
  }

  private ParticipantSettings stored(UUID spaceId, UUID eventId) {
    return settings
        .find(spaceId, eventId)
        .map(
            row ->
                new ParticipantSettings(
                    row.groupRosterVisibleToMembers(),
                    row.version(),
                    row.updatedAt(),
                    row.updatedByDisplayName()))
        .orElseGet(ParticipantSettings::defaults);
  }

  private boolean allows(EventAccessGate.Opened opened, UUID actorId, Permission permission) {
    if (opened.eventRole() == null) {
      return false;
    }
    EventLocation location = opened.location();
    String effect =
        permissions
            .findEffect(location.spaceId(), location.id(), actorId, permission.name())
            .orElse(null);
    return PermissionEvaluator.allows(
        permission, opened.eventRole(), opened.authorityEnded(), effect);
  }

  private static boolean requiredBoolean(JsonNode body, String field) {
    JsonNode node = body == null || !body.isObject() ? null : body.get(field);
    if (node == null || !node.isBoolean()) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", field));
    }
    return node.booleanValue();
  }

  private static int requiredVersion(JsonNode body) {
    JsonNode node = body == null || !body.isObject() ? null : body.get("expectedVersion");
    if (node == null || !node.isIntegralNumber() || !node.canConvertToInt() || node.asInt() < 0) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "expectedVersion"));
    }
    return node.asInt();
  }
}
