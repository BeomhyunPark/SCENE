package app.scene.event.rostersheet.mapper;

import app.scene.event.rostersheet.RosterSheetRow;
import app.scene.event.rostersheet.param.RosterSheetKey;
import app.scene.event.rostersheet.param.RosterSheetWrite;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface RosterSheetMapper {

  RosterSheetRow find(RosterSheetKey key);

  int insertFirst(RosterSheetWrite write);

  int updateVersion(RosterSheetWrite write);
}
