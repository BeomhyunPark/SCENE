package app.scene.event.application.mapper;

import app.scene.event.application.ApplicationAnswerRow;
import app.scene.event.application.ApplicationRow;
import app.scene.event.application.param.AnswerListQuery;
import app.scene.event.application.param.ApplicationKey;
import app.scene.event.application.param.ApplicationListQuery;
import app.scene.event.application.param.EventApplicationKey;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ApplicationQueryMapper {

  long countByEvent(EventApplicationKey key);

  List<ApplicationRow> findPage(ApplicationListQuery query);

  ApplicationRow find(ApplicationKey key);

  List<ApplicationAnswerRow> findAnswers(AnswerListQuery query);
}
