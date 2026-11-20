package app.scene.event.notification;

import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.space.EventUserRepository;
import app.scene.space.OperatorAuthority;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Who among an event's operators receives an operator notification, decided at the moment it is
 * made (DEC-080 §7.2). One SQL statement for every operator of the event, whatever their number.
 *
 * <p>An operator is someone with an {@code event_users} row, the same rule as {@code
 * EventAccessGate}: removal and leaving the space delete the row, so those people are out. The
 * permission is the effective one of {@link PermissionEvaluator}: role defaults ({@code
 * RoleDefaults}), then the person's {@code GRANT}/{@code REVOKE}; an OWNER whose handover ended
 * keeps only stored grants. A space OWNER or ADMIN without an event row is not a recipient (they
 * read the event but have no list of their own there).
 */
@Component
public class OperatorRecipients {

  private final EventUserRepository eventUsers;

  public OperatorRecipients(EventUserRepository eventUsers) {
    this.eventUsers = eventUsers;
  }

  /** Operators whose effective permissions include {@code permission}, minus {@code except}. */
  public List<UUID> withPermission(UUID spaceId, UUID eventId, Permission permission, UUID except) {
    List<UUID> out = new ArrayList<>();
    for (OperatorAuthority operator :
        eventUsers.findAuthorities(spaceId, eventId, permission.name())) {
      if (Objects.equals(operator.userId(), except)) {
        continue;
      }
      if (PermissionEvaluator.allows(
          permission, operator.role(), operator.authorityEnded(), operator.storedEffect())) {
        out.add(operator.userId());
      }
    }
    return out;
  }

  /** Event OWNERs whose handover has not ended (the old {@code operator_notices} recipients). */
  public List<UUID> owners(UUID spaceId, UUID eventId) {
    List<UUID> out = new ArrayList<>();
    for (OperatorAuthority operator :
        eventUsers.findAuthorities(spaceId, eventId, Permission.EVENT_LIFECYCLE.name())) {
      if ("OWNER".equals(operator.role()) && !operator.authorityEnded()) {
        out.add(operator.userId());
      }
    }
    return out;
  }

  /** Every operator of the event, minus {@code except} (for example a STAFF notice's author). */
  public List<UUID> all(UUID spaceId, UUID eventId, UUID except) {
    List<UUID> out = new ArrayList<>();
    for (OperatorAuthority operator :
        eventUsers.findAuthorities(spaceId, eventId, Permission.EVENT_READ.name())) {
      if (!Objects.equals(operator.userId(), except)) {
        out.add(operator.userId());
      }
    }
    return out;
  }
}
