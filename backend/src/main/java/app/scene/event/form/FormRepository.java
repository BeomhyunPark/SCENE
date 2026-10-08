package app.scene.event.form;

import app.scene.common.mybatis.PageParam;
import app.scene.common.web.PageRequest;
import app.scene.event.form.mapper.FieldMapper;
import app.scene.event.form.mapper.FormMapper;
import app.scene.event.form.mapper.FormQueryMapper;
import app.scene.event.form.param.EventFormKey;
import app.scene.event.form.param.FieldInsert;
import app.scene.event.form.param.FieldKey;
import app.scene.event.form.param.FieldLabelUpdate;
import app.scene.event.form.param.FieldListQuery;
import app.scene.event.form.param.FormAcceptingUpdate;
import app.scene.event.form.param.FormInsert;
import app.scene.event.form.param.FormKey;
import app.scene.event.form.param.FormListQuery;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Form and field rows. Applications are not stored here. */
@Component
public class FormRepository {

  /** One form per event, so the page order is only a stable id. */
  static final String LIST_ORDER = "id ASC";

  /** Field order is position, then id. Client sort is not accepted. */
  static final String FIELD_ORDER = "position ASC, id ASC";

  private final FormMapper forms;
  private final FieldMapper fields;
  private final FormQueryMapper queries;

  public FormRepository(FormMapper forms, FieldMapper fields, FormQueryMapper queries) {
    this.forms = forms;
    this.fields = fields;
    this.queries = queries;
  }

  public Optional<FormRow> findByEvent(UUID spaceId, UUID eventId) {
    return Optional.ofNullable(queries.findByEvent(EventFormKey.of(spaceId, eventId)));
  }

  public Optional<FormRow> find(UUID spaceId, UUID eventId, UUID formId) {
    return Optional.ofNullable(queries.find(FormKey.of(spaceId, eventId, formId)));
  }

  public long count(UUID spaceId, UUID eventId) {
    return queries.countByEvent(EventFormKey.of(spaceId, eventId));
  }

  public List<FormListRow> list(UUID spaceId, UUID eventId, PageRequest request) {
    long offset = request.offset();
    if (offset > Integer.MAX_VALUE) {
      throw new IllegalArgumentException("page offset does not fit an int");
    }
    return queries.findPage(
        FormListQuery.of(spaceId, eventId, PageParam.of((int) offset, request.size(), LIST_ORDER)));
  }

  public List<FormFieldRow> findFields(UUID spaceId, UUID eventId, UUID formId) {
    return queries.findFields(FieldListQuery.of(spaceId, eventId, formId, FIELD_ORDER));
  }

  public Optional<FormFieldRow> findField(UUID spaceId, UUID eventId, UUID formId, UUID fieldId) {
    return Optional.ofNullable(queries.findField(FieldKey.of(spaceId, eventId, formId, fieldId)));
  }

  public int countCustom(UUID spaceId, UUID eventId, UUID formId) {
    return queries.countCustom(FormKey.of(spaceId, eventId, formId));
  }

  public int nextPosition(UUID spaceId, UUID eventId, UUID formId) {
    return queries.maxPosition(FormKey.of(spaceId, eventId, formId)) + 1;
  }

  @Transactional
  public int save(UUID id, UUID spaceId, UUID eventId) {
    return forms.save(FormInsert.of(id, spaceId, eventId));
  }

  @Transactional
  public int updateAccepting(
      UUID spaceId, UUID eventId, UUID formId, boolean acceptingApplications) {
    return forms.updateAccepting(
        FormAcceptingUpdate.of(spaceId, eventId, formId, acceptingApplications));
  }

  @Transactional
  public int saveField(
      UUID id,
      UUID spaceId,
      UUID eventId,
      UUID formId,
      String kind,
      String systemKey,
      String label,
      int position) {
    return fields.save(
        FieldInsert.of(id, spaceId, eventId, formId, kind, systemKey, label, position));
  }

  @Transactional
  public int updateLabel(UUID spaceId, UUID eventId, UUID formId, UUID fieldId, String label) {
    return fields.updateLabel(FieldLabelUpdate.of(spaceId, eventId, formId, fieldId, label));
  }

  @Transactional
  public int deleteCustom(UUID spaceId, UUID eventId, UUID formId, UUID fieldId) {
    return fields.delete(FieldKey.of(spaceId, eventId, formId, fieldId));
  }
}
