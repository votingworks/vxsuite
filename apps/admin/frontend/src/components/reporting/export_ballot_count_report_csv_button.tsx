import React, { useContext, useState } from 'react';
import { Button } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { Tabulation } from '@votingworks/types';
import path from 'path';
import { generateElectionBasedSubfolderName } from '@votingworks/utils';
import { AppContext } from '../../contexts/app_context';
import {
  exportBallotCountReportCsv,
  getCastVoteRecordFileMode,
} from '../../api';
import { SaveBackendFileModal } from '../save_backend_file_modal';
import {
  REPORT_SUBFOLDER,
  generateBallotCountReportCsvFilename,
} from '../../utils/reporting';

export function ExportBallotCountReportCsvButton({
  filter,
  groupBy,
  ballotCountBreakdown,
  disabled,
}: {
  filter: Tabulation.Filter;
  groupBy: Tabulation.GroupBy;
  ballotCountBreakdown: Tabulation.BallotCountBreakdown;
  disabled?: boolean;
}): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [exportDate, setExportDate] = useState<Date>();

  function openModal() {
    setIsSaveModalOpen(true);
    setExportDate(new Date());
  }

  function closeModal() {
    setIsSaveModalOpen(false);
    setExportDate(undefined);
  }

  const exportBallotCountReportCsvMutation =
    exportBallotCountReportCsv.useMutation();
  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const isTestMode = castVoteRecordFileModeQuery.data === 'test';

  const defaultFilename = generateBallotCountReportCsvFilename({
    election,
    filter,
    groupBy,
    isTestMode,
    time: exportDate,
  });
  const defaultFilePath = path.join(
    generateElectionBasedSubfolderName(
      electionDefinition.election,
      electionDefinition.electionHash
    ),
    REPORT_SUBFOLDER,
    defaultFilename
  );

  return (
    <React.Fragment>
      <Button disabled={disabled} onPress={openModal}>
        Export Report CSV
      </Button>
      {isSaveModalOpen && (
        <SaveBackendFileModal
          saveFileStatus={exportBallotCountReportCsvMutation.status}
          saveFile={({ path: savePath }) =>
            exportBallotCountReportCsvMutation.mutate({
              path: savePath,
              filter,
              groupBy,
              ballotCountBreakdown,
            })
          }
          saveFileResult={exportBallotCountReportCsvMutation.data}
          resetSaveFileResult={exportBallotCountReportCsvMutation.reset}
          onClose={closeModal}
          fileType="ballot count report"
          fileTypeTitle="Ballot Count Report"
          defaultRelativePath={defaultFilePath}
        />
      )}
    </React.Fragment>
  );
}
