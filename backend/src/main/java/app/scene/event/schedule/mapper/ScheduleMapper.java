package app.scene.event.schedule.mapper;

import app.scene.event.schedule.ParticipantScheduleRow;
import app.scene.event.schedule.ScheduleItemRow;
import app.scene.event.schedule.SchedulePublicationRow;
import app.scene.event.schedule.param.ScheduleParam;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ScheduleMapper {

  Long findBoardVersion(ScheduleParam param);

  long bumpBoardVersion(ScheduleParam param);

  List<ScheduleItemRow> findItems(ScheduleParam param);

  UUID findSlotOwner(ScheduleParam param);

  int nextSortOrder(ScheduleParam param);

  int insertItem(ScheduleParam param);

  int updateItem(ScheduleParam param);

  int deleteItem(ScheduleParam param);

  List<String> findDismissedSlots(ScheduleParam param);

  int insertDismissal(ScheduleParam param);

  int deleteDismissals(ScheduleParam param);

  SchedulePublicationRow findLatestPublication(ScheduleParam param);

  int insertPublication(ScheduleParam param);

  ParticipantScheduleRow findParticipantSchedule(ScheduleParam param);
}
