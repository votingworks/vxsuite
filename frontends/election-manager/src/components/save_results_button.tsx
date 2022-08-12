import React, { useContext, useState } from 'react';
import { Button } from '@votingworks/ui';
import { assert, generateFinalExportDefaultFilename } from '@votingworks/utils';
import { SaveFileToUsb, FileType } from './save_file_to_usb';
import { AppContext } from '../contexts/app_context';
import { generateResultsCsv } from '../utils/generate_results_csv';

export function SaveResultsButton(): JSX.Element {
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const { fullElectionTally, castVoteRecordFiles, electionDefinition } =
    useContext(AppContext);
  assert(electionDefinition);
  const isTestMode = castVoteRecordFiles?.fileMode === 'test';
  const { election } = electionDefinition;

  const defaultFilename = generateFinalExportDefaultFilename(
    isTestMode,
    election
  );
  return (
    <React.Fragment>
      <Button onPress={() => setIsSaveModalOpen(true)}>Save Results</Button>
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
