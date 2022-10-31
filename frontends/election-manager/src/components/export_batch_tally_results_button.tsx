import React, { useContext, useState } from 'react';
import { Button } from '@votingworks/ui';
import {
  assert,
  generateBatchResultsDefaultFilename,
} from '@votingworks/utils';
import { Admin } from '@votingworks/api';
import { SaveFileToUsb, FileType } from './save_file_to_usb';
import { AppContext } from '../contexts/app_context';
import { generateBatchTallyResultsCsv } from '../utils/generate_batch_tally_results_csv';
import { useCvrFileModeQuery } from '../hooks/use_cvr_file_mode_query';

export function ExportBatchTallyResultsButton(): JSX.Element | null {
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const { fullElectionTally, electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;

  const isTestMode = useCvrFileModeQuery().data === Admin.CvrFileMode.Test;

  const defaultFilename = generateBatchResultsDefaultFilename(
    isTestMode,
    election
  );
  return (
    <React.Fragment>
      <Button small onPress={() => setIsSaveModalOpen(true)}>
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
