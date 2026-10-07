package app.scene.event.transfer.mapper;

import app.scene.event.transfer.TransferRow;
import app.scene.event.transfer.TransferView;
import app.scene.event.transfer.param.TransferAcceptUpdate;
import app.scene.event.transfer.param.TransferId;
import app.scene.event.transfer.param.TransferInsert;
import app.scene.event.transfer.param.TransferLockKey;
import app.scene.event.transfer.param.TransferSnapshotRestore;
import app.scene.event.transfer.param.TransferStatusUpdate;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface OwnerTransferMapper {

  TransferRow findEventById(TransferId key);

  TransferRow findForUpdate(TransferLockKey key);

  TransferView findView(TransferLockKey key);

  int insertPending(TransferInsert insert);

  int updateAccepted(TransferAcceptUpdate update);

  int updateStatus(TransferStatusUpdate update);

  int restoreOverrides(TransferSnapshotRestore restore);
}
