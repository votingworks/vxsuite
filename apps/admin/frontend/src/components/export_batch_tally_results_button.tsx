import React, { useContext, useState } from 'react';
import { Button } from '@votingworks/ui';
import { generateBatchResultsDefaultFilename } from '@votingworks/utils';
import { assert, err } from '@votingworks/basics';
import { AppContext } from '../contexts/app_context';
import { exportBatchResults, getCastVoteRecordFileMode } from '../api';
import { SaveFileModal, SaveFileResult } from './save_file_modal';

export function ExportBatchTallyResultsButton(): JSX.Element {
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;

  const exportBatchResultsMutation = exportBatchResults.useMutation();

  async function onSave(path: string): Promise<SaveFileResult> {
    try {
      const exportResult = await exportBatchResultsMutation.mutateAsync({
        path,
      });
      return exportResult;
    } catch (error) {
      // Handled by default query client error handling
    }

    return err({ type: 'api-error', message: 'API error.' });
  }

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
        <SaveFileModal
          onClose={() => setIsSaveModalOpen(false)}
          onSave={onSave}
          fileTypeTitle="Batch Results"
          fileType="batch results"
          defaultRelativePath={defaultFilename}
        />
      )}
    </React.Fragment>
  );
}
