package app.scene.event.group.mapper;

import app.scene.event.group.ActiveParticipant;
import app.scene.event.group.Assignment;
import app.scene.event.group.BoardRow;
import app.scene.event.group.Group;
import app.scene.event.group.PublicationRow;
import app.scene.event.group.WithdrawnParticipant;
import app.scene.event.group.param.GroupParam;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface GroupMapper {

  Long findBoardVersion(GroupParam param);

  long bumpBoardVersion(GroupParam param);

  List<Group> findGroups(GroupParam param);

  boolean existsName(GroupParam param);

  int insertGroup(GroupParam param);

  int updateGroupName(GroupParam param);

  int bumpGroupVersion(GroupParam param);

  int updateSortOrder(GroupParam param);

  int deleteGroup(GroupParam param);

  List<BoardRow> findBoardParticipants(GroupParam param);

  List<WithdrawnParticipant> findWithdrawn(GroupParam param);

  List<Assignment> findAssignments(GroupParam param);

  List<Assignment> findMembers(GroupParam param);

  int upsertAssignment(GroupParam param);

  int deleteAssignment(GroupParam param);

  int deleteGroupAssignments(GroupParam param);

  int updateLeader(GroupParam param);

  int insertLog(GroupParam param);

  List<ActiveParticipant> findActive(GroupParam param);

  PublicationRow findLatestPublication(GroupParam param);

  int insertPublication(GroupParam param);
}
