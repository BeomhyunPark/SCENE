package app.scene.event.lifecycle.mapper;

import app.scene.event.lifecycle.param.LifecycleTransitionInsert;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface EventLifecycleTransitionMapper {

  void save(LifecycleTransitionInsert insert);
}
