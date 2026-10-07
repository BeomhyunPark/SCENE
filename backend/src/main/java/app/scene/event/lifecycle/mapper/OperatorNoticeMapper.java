package app.scene.event.lifecycle.mapper;

import app.scene.event.lifecycle.param.NoticeInsert;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface OperatorNoticeMapper {

  int saveForOwners(NoticeInsert insert);
}
