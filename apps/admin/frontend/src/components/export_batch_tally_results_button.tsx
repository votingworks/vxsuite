import React, { useContext, useState } from 'react';
import { Button } from '@votingworks/ui';
import { generateBatchResultsDefaultFilename } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { SaveFileToUsb, FileType } from './save_file_to_usb';
import { AppContext } from '../contexts/app_context';
import { generateBatchTallyResultsCsv } from '../utils/generate_batch_tally_results_csv';
import { getCastVoteRecordFileMode } from '../api';

export function ExportBatchTallyResultsButton(): JSX.Element {
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const { fullElectionTally, electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;

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
        <SaveFileToUsb
          onClose={() => setIsSaveModalOpen(false)}
          generateFileContent={() =>
            generateBatchTallyResultsCsv(fullElectionTally, election)
          }
          defaultFilename={defaultFilename}
          fileType={FileType.BatchResultsCsv}
        />
      )}
    </React.Fragment>
  );
}
