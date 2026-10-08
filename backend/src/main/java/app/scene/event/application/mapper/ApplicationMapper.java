package app.scene.event.application.mapper;

import app.scene.event.application.param.ApplicationInsert;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ApplicationMapper {

  int save(ApplicationInsert insert);
}
