import React, { useContext, useState } from 'react';
import { Button } from '@votingworks/ui';
import { generateFinalExportDefaultFilename } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { AppContext } from '../contexts/app_context';
import { exportResultsCsv, getCastVoteRecordFileMode } from '../api';
import { SaveBackendFileModal } from './save_backend_file_modal';

export function SaveResultsButton({
  disabled,
}: {
  disabled?: boolean;
}): JSX.Element {
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;

  const exportResultsCsvMutation = exportResultsCsv.useMutation();
  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const isTestMode = castVoteRecordFileModeQuery.data === 'test';

  const defaultFilename = generateFinalExportDefaultFilename(
    isTestMode,
    election
  );
  return (
    <React.Fragment>
      <Button
        disabled={disabled || !castVoteRecordFileModeQuery.isSuccess}
        onPress={() => setIsSaveModalOpen(true)}
      >
        Save Results
      </Button>
      {isSaveModalOpen && (
        <SaveBackendFileModal
          saveFileStatus={exportResultsCsvMutation.status}
          saveFile={exportResultsCsvMutation.mutate}
          saveFileResult={exportResultsCsvMutation.data}
          resetSaveFileResult={exportResultsCsvMutation.reset}
          onClose={() => setIsSaveModalOpen(false)}
          fileType="results"
          fileTypeTitle="Results"
          defaultRelativePath={defaultFilename}
        />
      )}
    </React.Fragment>
  );
}
