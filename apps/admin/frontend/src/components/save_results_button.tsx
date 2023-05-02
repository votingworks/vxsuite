import React, { useContext, useState } from 'react';
import { Button } from '@votingworks/ui';
import { generateFinalExportDefaultFilename } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { SaveFileToUsb, FileType } from './save_file_to_usb';
import { AppContext } from '../contexts/app_context';
import { generateResultsCsv } from '../utils/generate_results_csv';
import { getCastVoteRecordFileMode } from '../api';

export function SaveResultsButton({
  disabled,
}: {
  disabled?: boolean;
}): JSX.Element {
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const { fullElectionTally, electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;

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
        <SaveFileToUsb
          onClose={() => setIsSaveModalOpen(false)}
          generateFileContent={() =>
            generateResultsCsv(fullElectionTally, election)
          }
          defaultFilename={defaultFilename}
          fileType={FileType.Results}
        />
      )}
    </React.Fragment>
  );
}
