package app.scene.event.lifecycle;

import app.scene.common.mybatis.AuthorityStatuses;
import app.scene.event.lifecycle.mapper.OperatorNoticeMapper;
import app.scene.event.lifecycle.param.NoticeInsert;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class OperatorNoticeRepository {

  private static final String OWNER = "OWNER";

  private final OperatorNoticeMapper notices;

  public OperatorNoticeRepository(OperatorNoticeMapper notices) {
    this.notices = notices;
  }

  @Transactional
  public void saveForOwners(UUID spaceId, UUID eventId, String kind, Instant now) {
    notices.saveForOwners(
        NoticeInsert.of(spaceId, eventId, kind, now, OWNER, AuthorityStatuses.ENDED));
  }
}
