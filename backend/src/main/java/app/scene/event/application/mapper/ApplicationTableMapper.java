package app.scene.event.application.mapper;

import app.scene.event.application.ApplicationTableState;
import app.scene.event.application.param.EventApplicationKey;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

/** Applicant table (#308): group and check-in state of each submitted application. */
@Mapper
public interface ApplicationTableMapper {

  List<ApplicationTableState> findStates(EventApplicationKey key);
}
