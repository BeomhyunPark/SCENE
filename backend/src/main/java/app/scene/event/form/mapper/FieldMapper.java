package app.scene.event.form.mapper;

import app.scene.event.form.param.FieldInsert;
import app.scene.event.form.param.FieldKey;
import app.scene.event.form.param.FieldLabelUpdate;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface FieldMapper {

  int save(FieldInsert insert);

  int updateLabel(FieldLabelUpdate update);

  int delete(FieldKey key);
}
