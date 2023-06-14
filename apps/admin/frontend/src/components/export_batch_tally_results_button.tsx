import React, { useContext, useState } from 'react';
import { Button } from '@votingworks/ui';
import { generateBatchResultsDefaultFilename } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { AppContext } from '../contexts/app_context';
import { exportBatchResults, getCastVoteRecordFileMode } from '../api';
import { SaveBackendFileModal } from './save_backend_file_modal';

export function ExportBatchTallyResultsButton(): JSX.Element {
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;

  const exportBatchResultsMutation = exportBatchResults.useMutation();

  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const isTestMode = castVoteRecordFileModeQuery.data === 'test';
  const defaultFilename = generateBatchResultsDefaultFilename(
    isTestMode,
    election
  );

  return (
    <React.Fragment>
      <Button
        small
        onPress={() => setIsSaveModalOpen(true)}
        disabled={!castVoteRecordFileModeQuery.isSuccess}
      >
        Save Batch Results as CSV
      </Button>
      {isSaveModalOpen && (
        <SaveBackendFileModal
          saveFileStatus={exportBatchResultsMutation.status}
          saveFile={exportBatchResultsMutation.mutate}
          saveFileResult={exportBatchResultsMutation.data}
          resetSaveFileResult={exportBatchResultsMutation.reset}
          onClose={() => setIsSaveModalOpen(false)}
          fileTypeTitle="Batch Results"
          fileType="batch results"
          defaultRelativePath={defaultFilename}
        />
      )}
    </React.Fragment>
  );
}
