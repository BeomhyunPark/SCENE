package app.scene.event.room.mapper;

import app.scene.event.room.MateRow;
import app.scene.event.room.PersonRow;
import app.scene.event.room.PublicationRow;
import app.scene.event.room.RoomRow;
import app.scene.event.room.param.RoomParam;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface RoomMapper {

  Long findBoardVersion(RoomParam param);

  long bumpBoardVersion(RoomParam param);

  List<RoomRow> findRooms(RoomParam param);

  boolean existsName(RoomParam param);

  int insertRoom(RoomParam param);

  int updateRoom(RoomParam param);

  int updateSortOrder(RoomParam param);

  int deleteRoomAssignments(RoomParam param);

  int deleteRoom(RoomParam param);

  List<UUID> findRoomMemberIds(RoomParam param);

  String findGenderConfig(RoomParam param);

  List<PersonRow> findPeople(RoomParam param);

  List<MateRow> findMates(RoomParam param);

  int upsertAssignment(RoomParam param);

  int updateBasis(RoomParam param);

  int deleteAssignment(RoomParam param);

  int insertLog(RoomParam param);

  List<UUID> findWithdrawnSince(RoomParam param);

  PublicationRow findLatestPublication(RoomParam param);

  boolean existsPublication(RoomParam param);

  int insertPublication(RoomParam param);
}
