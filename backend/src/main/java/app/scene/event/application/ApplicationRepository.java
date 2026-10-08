package app.scene.event.application;

import app.scene.common.mybatis.PageParam;
import app.scene.common.web.PageRequest;
import app.scene.event.application.mapper.AnswerMapper;
import app.scene.event.application.mapper.ApplicationMapper;
import app.scene.event.application.mapper.ApplicationQueryMapper;
import app.scene.event.application.param.AnswerInsert;
import app.scene.event.application.param.AnswerListQuery;
import app.scene.event.application.param.ApplicationInsert;
import app.scene.event.application.param.ApplicationKey;
import app.scene.event.application.param.ApplicationListQuery;
import app.scene.event.application.param.EventApplicationKey;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Application source rows and their answers. Participants are not stored here. */
@Component
public class ApplicationRepository {

  /** Server order. Client sort is not accepted. */
  static final String LIST_ORDER = "submitted_at ASC, id ASC";

  /** Answer order follows the field, then the field id. */
  static final String ANSWER_ORDER = "f.position ASC, f.id ASC";

  private static final Set<String> STATUSES = Set.of("SUBMITTED", "SUPERSEDED", "WITHDRAWN");

  private final ApplicationMapper applications;
  private final AnswerMapper answers;
  private final ApplicationQueryMapper queries;

  public ApplicationRepository(
      ApplicationMapper applications, AnswerMapper answers, ApplicationQueryMapper queries) {
    this.applications = applications;
    this.answers = answers;
    this.queries = queries;
  }

  public long count(UUID spaceId, UUID eventId) {
    return queries.countByEvent(EventApplicationKey.of(spaceId, eventId));
  }

  public List<ApplicationRow> list(UUID spaceId, UUID eventId, PageRequest request) {
    long offset = request.offset();
    if (offset > Integer.MAX_VALUE) {
      throw new IllegalArgumentException("page offset does not fit an int");
    }
    return queries.findPage(
        ApplicationListQuery.of(
            spaceId, eventId, PageParam.of((int) offset, request.size(), LIST_ORDER)));
  }

  public Optional<ApplicationRow> find(UUID spaceId, UUID eventId, UUID applicationId) {
    return Optional.ofNullable(queries.find(ApplicationKey.of(spaceId, eventId, applicationId)));
  }

  public List<ApplicationAnswerRow> findAnswers(UUID spaceId, UUID eventId, UUID applicationId) {
    return queries.findAnswers(AnswerListQuery.of(spaceId, eventId, applicationId, ANSWER_ORDER));
  }

  /**
   * Stores one application and its answers in one transaction. There is no HTTP create. Status is
   * one of the three stored values.
   */
  @Transactional
  public void save(ApplicationInsert application, List<AnswerInsert> answerRows) {
    if (application.getParticipantId() == null) {
      throw new IllegalArgumentException("participant is required");
    }
    if (application.getStatus() == null || !STATUSES.contains(application.getStatus())) {
      throw new IllegalArgumentException("application status is not a stored value");
    }
    if (answerRows == null) {
      throw new IllegalArgumentException("answers are required");
    }
    if (applications.save(application) != 1) {
      throw new IllegalStateException("application was not stored");
    }
    for (AnswerInsert answer : answerRows) {
      if (answers.save(answer) != 1) {
        throw new IllegalStateException("answer was not stored");
      }
    }
  }
}
