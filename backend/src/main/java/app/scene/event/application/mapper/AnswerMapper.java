package app.scene.event.application.mapper;

import app.scene.event.application.param.AnswerInsert;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AnswerMapper {

  int save(AnswerInsert insert);
}
