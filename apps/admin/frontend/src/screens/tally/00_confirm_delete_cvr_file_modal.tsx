/* istanbul ignore file */

import React from 'react';
import { Modal, Button, P, Font } from '@votingworks/ui';
import { format } from '@votingworks/utils';
import * as api from '../../api';

export type ConfirmDeleteCvrFileModalProps = Props;

interface Props {
  fileId: string;
  onClose: VoidFunction;
}

export function ConfirmDeleteCvrFileModal(props: Props): React.ReactNode {
  const { fileId, onClose } = props;

  const deleteCvrFile = api.deleteCvrFile.useMutation();
  const files = api.getCastVoteRecordFiles.useQuery().data;
  const file = files?.find((f) => f.id === fileId);

  React.useEffect(() => {
    if (!file) onClose();
  }, [file, onClose]);

  if (!files || !file) return null;

  function onConfirm() {
    deleteCvrFile.mutate({ id: fileId }, { onSuccess: onClose });
  }

  const deleting = deleteCvrFile.isLoading;
  const nCvrs = file.numCvrsImported;

  return (
    <Modal
      title="Delete CVR File?"
      content={
        <P>
          This will delete <Font weight="bold">{format.count(nCvrs)}</Font> cast
          vote {nCvrs === 1 ? 'record' : 'records'}. All associated tallies will
          be removed from reports.
        </P>
      }
      actions={
        <React.Fragment>
          <Button
            icon={deleting ? 'Loading' : 'Trash'}
            variant={deleting ? 'neutral' : 'danger'}
            onPress={onConfirm}
            disabled={deleting}
          >
            {deleting ? 'Deleting' : 'Delete'}
          </Button>

          <Button onPress={onClose} disabled={deleting}>
            Cancel
          </Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
    />
  );
}
