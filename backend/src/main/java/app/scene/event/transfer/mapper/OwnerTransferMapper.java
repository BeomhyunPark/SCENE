package app.scene.event.transfer.mapper;

import app.scene.event.transfer.TransferRow;
import app.scene.event.transfer.param.TransferAcceptUpdate;
import app.scene.event.transfer.param.TransferLockKey;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface OwnerTransferMapper {

  TransferRow findForUpdate(TransferLockKey key);

  int updateAccepted(TransferAcceptUpdate update);
}
