package app.scene.event.notification.mapper;

import app.scene.event.notification.param.NotificationParam;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface NotificationMapper {

  /** Merges and inserts one row per recipient in one statement. Returns inserted rows. */
  int insertMerged(NotificationParam param);

  int markRead(NotificationParam param);

  int markTargetReadForAll(NotificationParam param);
}
