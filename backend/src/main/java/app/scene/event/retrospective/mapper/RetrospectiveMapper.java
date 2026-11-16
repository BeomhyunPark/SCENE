package app.scene.event.retrospective.mapper;

import app.scene.event.retrospective.RetrospectiveRow;
import app.scene.event.retrospective.param.RetrospectiveKey;
import app.scene.event.retrospective.param.RetrospectiveWrite;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface RetrospectiveMapper {

  RetrospectiveRow find(RetrospectiveKey key);

  int insertFirst(RetrospectiveWrite write);

  int updateVersion(RetrospectiveWrite write);
}
