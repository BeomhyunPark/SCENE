package app.scene.event.transfer.mapper;

import app.scene.event.transfer.DueTransfer;
import app.scene.event.transfer.TransferRow;
import app.scene.event.transfer.param.TransferAcceptUpdate;
import app.scene.event.transfer.param.TransferCompletion;
import app.scene.event.transfer.param.TransferDueQuery;
import app.scene.event.transfer.param.TransferLockKey;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface OwnerTransferMapper {

  TransferRow findForUpdate(TransferLockKey key);

  List<DueTransfer> findDueForUpdate(TransferDueQuery query);

  int updateAccepted(TransferAcceptUpdate update);

  int updateCompleted(TransferCompletion update);
}
