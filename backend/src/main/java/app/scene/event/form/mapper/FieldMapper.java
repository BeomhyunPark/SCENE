package app.scene.event.form.mapper;

import app.scene.event.form.param.FieldInsert;
import app.scene.event.form.param.FieldKey;
import app.scene.event.form.param.FieldPositionUpdate;
import app.scene.event.form.param.FieldPresetStateUpdate;
import app.scene.event.form.param.FieldUpdate;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface FieldMapper {

  int save(FieldInsert insert);

  int update(FieldUpdate update);

  int updatePresetState(FieldPresetStateUpdate update);

  int updatePosition(FieldPositionUpdate update);

  int delete(FieldKey key);
}
