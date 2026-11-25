package app.scene.event.checkin;

import app.scene.event.room.RoomDesk;

/**
 * The room the front desk tells the participant (G5 #460, DEC-085 §10): name and location note of
 * the latest room publication. Null before publication or when unassigned; the working copy is
 * never shown here.
 */
public record CheckInRoom(String name, String locationNote) {

  static CheckInRoom of(RoomDesk.Stay stay) {
    return stay.room() == null
        ? null
        : new CheckInRoom(stay.room().name(), stay.room().locationNote());
  }
}
