import React, { useContext, useState } from 'react';
import { Button } from '@votingworks/ui';
import {
  assert,
  generateBatchResultsDefaultFilename,
} from '@votingworks/utils';
import { SaveFileToUsb, FileType } from './save_file_to_usb';
import { AppContext } from '../contexts/app_context';
import { generateBatchTallyResultsCsv } from '../utils/generate_batch_tally_results_csv';

export function ExportBatchTallyResultsButton(): JSX.Element {
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const { fullElectionTally, castVoteRecordFiles, electionDefinition } =
    useContext(AppContext);
  assert(electionDefinition);
  const isTestMode = castVoteRecordFiles?.fileMode === 'test';
  const { election } = electionDefinition;

  const defaultFilename = generateBatchResultsDefaultFilename(
    isTestMode,
    election
  );
  return (
    <React.Fragment>
      <Button small onPress={() => setIsSaveModalOpen(true)}>
        Export Batch Results as CSV
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
