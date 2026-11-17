package app.scene.event.group;

import app.scene.event.group.GroupResults.Assigned;
import app.scene.event.group.GroupResults.BoardVersion;
import app.scene.event.group.GroupResults.GroupDeleted;
import app.scene.event.group.GroupResults.GroupWritten;
import app.scene.event.group.GroupResults.LeadersWritten;
import app.scene.identity.OperatorPrincipal;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * Operator group board, working-copy writes, publication, and the published view (api.md "조 편성").
 * The participant view is {@link ParticipantGroupController}.
 */
@RestController
public class GroupController {

  private static final String BASE = "/api/v1/operator/events/{eventId}";

  private final GroupService groups;

  public GroupController(GroupService groups) {
    this.groups = groups;
  }

  @GetMapping(BASE + "/group-board")
  GroupBoard board(@PathVariable UUID eventId) {
    return groups.board(actor(), eventId);
  }

  @PostMapping(BASE + "/groups")
  ResponseEntity<GroupWritten> create(
      @PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return ResponseEntity.status(HttpStatus.CREATED).body(groups.create(actor(), eventId, body));
  }

  @PutMapping(BASE + "/groups/order")
  BoardVersion reorder(@PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return groups.reorder(actor(), eventId, body);
  }

  @PatchMapping(BASE + "/groups/{groupId}")
  GroupWritten rename(
      @PathVariable UUID eventId,
      @PathVariable UUID groupId,
      @RequestBody(required = false) JsonNode body) {
    return groups.rename(actor(), eventId, groupId, body);
  }

  @DeleteMapping(BASE + "/groups/{groupId}")
  GroupDeleted delete(
      @PathVariable UUID eventId,
      @PathVariable UUID groupId,
      @RequestParam(required = false) String expectedVersion) {
    return groups.delete(actor(), eventId, groupId, expectedVersion);
  }

  @PutMapping(BASE + "/groups/{groupId}/leaders")
  LeadersWritten leaders(
      @PathVariable UUID eventId,
      @PathVariable UUID groupId,
      @RequestBody(required = false) JsonNode body) {
    return groups.leaders(actor(), eventId, groupId, body);
  }

  @PutMapping(BASE + "/groups/{groupId}/members/order")
  BoardVersion memberOrder(
      @PathVariable UUID eventId,
      @PathVariable UUID groupId,
      @RequestBody(required = false) JsonNode body) {
    return groups.memberOrder(actor(), eventId, groupId, body);
  }

  @PostMapping(BASE + "/group-assignments")
  Assigned assign(@PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return groups.assign(actor(), eventId, body);
  }

  @PostMapping(BASE + "/groups/publish")
  PublishResult publish(@PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return groups.publish(actor(), eventId, body);
  }

  @GetMapping(BASE + "/groups/published")
  PublishedGroups published(@PathVariable UUID eventId) {
    return groups.published(actor(), eventId);
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
