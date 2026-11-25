package app.scene.event.room;

import app.scene.event.room.RoomViews.Assigned;
import app.scene.event.room.RoomViews.Board;
import app.scene.event.room.RoomViews.BoardVersion;
import app.scene.event.room.RoomViews.PublishResult;
import app.scene.event.room.RoomViews.Published;
import app.scene.event.room.RoomViews.Reviewed;
import app.scene.event.room.RoomViews.RoomDeleted;
import app.scene.event.room.RoomViews.RoomWritten;
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
 * Operator room board, working-copy writes, publication, and the published view (api.md "숙소"). The
 * participant view is {@link ParticipantRoomController}.
 */
@RestController
public class RoomController {

  private static final String BASE = "/api/v1/operator/events/{eventId}";

  private final RoomService rooms;

  public RoomController(RoomService rooms) {
    this.rooms = rooms;
  }

  @GetMapping(BASE + "/room-board")
  Board board(@PathVariable UUID eventId) {
    return rooms.board(actor(), eventId);
  }

  @PostMapping(BASE + "/rooms")
  ResponseEntity<RoomWritten> create(
      @PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return ResponseEntity.status(HttpStatus.CREATED).body(rooms.create(actor(), eventId, body));
  }

  @PutMapping(BASE + "/rooms/order")
  BoardVersion reorder(@PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return rooms.reorder(actor(), eventId, body);
  }

  @PatchMapping(BASE + "/rooms/{roomId}")
  RoomWritten update(
      @PathVariable UUID eventId,
      @PathVariable UUID roomId,
      @RequestBody(required = false) JsonNode body) {
    return rooms.update(actor(), eventId, roomId, body);
  }

  @DeleteMapping(BASE + "/rooms/{roomId}")
  RoomDeleted delete(
      @PathVariable UUID eventId,
      @PathVariable UUID roomId,
      @RequestParam(required = false) String expectedVersion) {
    return rooms.delete(actor(), eventId, roomId, expectedVersion);
  }

  @PostMapping(BASE + "/room-assignments")
  Assigned assign(@PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return rooms.assign(actor(), eventId, body);
  }

  @PostMapping(BASE + "/room-assignments/review")
  Reviewed confirmReview(@PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return rooms.confirmReview(actor(), eventId, body);
  }

  @PostMapping(BASE + "/rooms/publish")
  PublishResult publish(@PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return rooms.publish(actor(), eventId, body);
  }

  @GetMapping(BASE + "/rooms/published")
  Published published(@PathVariable UUID eventId) {
    return rooms.published(actor(), eventId);
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
