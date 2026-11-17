package app.scene.event.checkin.mapper;

import app.scene.event.checkin.CheckIn;
import app.scene.event.checkin.CheckInCounts;
import app.scene.event.checkin.CheckInLogItem;
import app.scene.event.checkin.CheckInTarget;
import app.scene.event.checkin.KeyedLog;
import app.scene.event.checkin.RosterRow;
import app.scene.event.checkin.param.CheckInParam;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CheckInMapper {

  CheckInTarget findTarget(CheckInParam param);

  CheckIn findCheckIn(CheckInParam param);

  KeyedLog findKeyedLog(CheckInParam param);

  int insertCheckIn(CheckInParam param);

  int updateCheckedIn(CheckInParam param);

  int updateCancelled(CheckInParam param);

  int insertLog(CheckInParam param);

  CheckInCounts counts(CheckInParam param);

  long countRoster(CheckInParam param);

  List<RosterRow> findRoster(CheckInParam param);

  long countLogs(CheckInParam param);

  List<CheckInLogItem> findLogs(CheckInParam param);
}
