package app.scene.event.lifecycle.mapper;

import app.scene.event.lifecycle.LifecycleTransitionView;
import app.scene.event.lifecycle.param.EventKey;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface EventLifecycleTransitionQueryMapper {

  LifecycleTransitionView findLatest(EventKey key);
}
