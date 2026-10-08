package app.scene.event.form.mapper;

import app.scene.event.form.FormFieldRow;
import app.scene.event.form.FormListRow;
import app.scene.event.form.FormRow;
import app.scene.event.form.param.EventFormKey;
import app.scene.event.form.param.FieldKey;
import app.scene.event.form.param.FieldListQuery;
import app.scene.event.form.param.FormKey;
import app.scene.event.form.param.FormListQuery;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface FormQueryMapper {

  FormRow findByEvent(EventFormKey key);

  FormRow find(FormKey key);

  long countByEvent(EventFormKey key);

  List<FormListRow> findPage(FormListQuery query);

  List<FormFieldRow> findFields(FieldListQuery query);

  FormFieldRow findField(FieldKey key);

  int countCustom(FormKey key);

  Integer maxPosition(FormKey key);
}
