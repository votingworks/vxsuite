import React, { useContext, useState } from 'react';
import { Button } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import path from 'path';
import { generateElectionBasedSubfolderName } from '@votingworks/utils';
import type { BallotCountReportSpec } from '@votingworks/admin-backend';
import { AppContext } from '../../contexts/app_context';
import {
  exportBallotCountReportPdf,
  getCastVoteRecordFileMode,
} from '../../api';
import { SaveBackendFileModal } from '../save_backend_file_modal';
import {
  REPORT_SUBFOLDER,
  generateBallotCountReportPdfFilename,
} from '../../utils/reporting';

export function ExportBallotCountReportPdfButton({
  filter,
  groupBy,
  includeSheetCounts,
  disabled,
}: BallotCountReportSpec & {
  disabled?: boolean;
}): JSX.Element {
  const { electionDefinition, isOfficialResults } = useContext(AppContext);
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

  const exportMutation = exportBallotCountReportPdf.useMutation();
  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const isTestMode = castVoteRecordFileModeQuery.data === 'test';

  const defaultFilename = generateBallotCountReportPdfFilename({
    election,
    filter,
    groupBy,
    isTestMode,
    isOfficialResults,
    time: exportDate ?? new Date(),
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
        Export Report PDF
      </Button>
      {isSaveModalOpen && (
        <SaveBackendFileModal
          saveFileStatus={exportMutation.status}
          saveFile={({ path: savePath }) =>
            exportMutation.mutate({
              path: savePath,
              filter,
              groupBy,
              includeSheetCounts,
            })
          }
          saveFileResult={exportMutation.data}
          resetSaveFileResult={exportMutation.reset}
          onClose={closeModal}
          fileType="ballot count report"
          fileTypeTitle="Ballot Count Report"
          defaultRelativePath={defaultFilePath}
        />
      )}
    </React.Fragment>
  );
}
