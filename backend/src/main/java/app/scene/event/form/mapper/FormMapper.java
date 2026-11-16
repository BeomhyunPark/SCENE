package app.scene.event.form.mapper;

import app.scene.event.form.param.FormAcceptingUpdate;
import app.scene.event.form.param.FormInsert;
import app.scene.event.form.param.FormSetupUpdate;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface FormMapper {

  int save(FormInsert insert);

  int updateAccepting(FormAcceptingUpdate update);

  int updateSetup(FormSetupUpdate update);
}
