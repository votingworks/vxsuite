import { Button } from '@votingworks/ui';
import React from 'react';
import { generateElectionBasedSubfolderName } from '@votingworks/utils';
import { ElectionDefinition } from '@votingworks/types';
import { join } from 'path';
import { FileType, SaveFrontendFileModal } from '../save_frontend_file_modal';
import { REPORT_SUBFOLDER } from '../../utils/reporting';

export function ExportReportPdfButton({
  electionDefinition,
  generateReportPdf,
  defaultFilename,
  disabled,
  fileType,
}: {
  electionDefinition: ElectionDefinition;
  generateReportPdf: () => Promise<Uint8Array>;
  defaultFilename: string;
  disabled?: boolean;
  fileType: FileType;
}): JSX.Element {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  return (
    <React.Fragment>
      <Button
        onPress={() => setIsModalOpen(true)}
        disabled={disabled || !window.kiosk}
      >
        Export Report PDF
      </Button>
      {isModalOpen && (
        <SaveFrontendFileModal
          onClose={() => setIsModalOpen(false)}
          generateFileContent={generateReportPdf}
          defaultFilename={defaultFilename}
          defaultDirectory={join(
            generateElectionBasedSubfolderName(
              electionDefinition.election,
              electionDefinition.electionHash
            ),
            REPORT_SUBFOLDER
          )}
          fileType={fileType}
        />
      )}
    </React.Fragment>
  );
}
