package app.scene.event.lifecycle.mapper;

import app.scene.event.lifecycle.LifecycleTransitionRow;
import app.scene.event.lifecycle.LifecycleTransitionView;
import app.scene.event.lifecycle.param.EventKey;
import app.scene.event.lifecycle.param.LifecycleTransitionListQuery;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface EventLifecycleTransitionQueryMapper {

  LifecycleTransitionView findLatest(EventKey key);

  long count(EventKey key);

  List<LifecycleTransitionRow> findPage(LifecycleTransitionListQuery query);
}
