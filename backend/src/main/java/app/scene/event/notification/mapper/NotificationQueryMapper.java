package app.scene.event.notification.mapper;

import app.scene.event.notification.NotificationRow;
import app.scene.event.notification.NotificationSummaryRow;
import app.scene.event.notification.param.NotificationParam;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface NotificationQueryMapper {

  NotificationSummaryRow findSummary(NotificationParam param);

  List<NotificationRow> findPage(NotificationParam param);

  List<UUID> findUnreadTargets(NotificationParam param);
}
