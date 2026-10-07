package app.scene.space.mapper;

import app.scene.space.param.MemberQuery;
import app.scene.space.param.MemberStatusUpdate;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface MemberMapper {

  int count(MemberQuery query);

  int updateLeft(MemberStatusUpdate update);
}
