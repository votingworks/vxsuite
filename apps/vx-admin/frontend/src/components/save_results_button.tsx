import React, { useContext, useState } from 'react';
import { Button } from '@votingworks/ui';
import { generateFinalExportDefaultFilename } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { Admin } from '@votingworks/api';
import { SaveFileToUsb, FileType } from './save_file_to_usb';
import { AppContext } from '../contexts/app_context';
import { generateResultsCsv } from '../utils/generate_results_csv';
import { useCvrFileModeQuery } from '../hooks/use_cvr_file_mode_query';

export function SaveResultsButton(): JSX.Element {
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const { fullElectionTally, electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;

  const isTestMode = useCvrFileModeQuery().data === Admin.CvrFileMode.Test;

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
