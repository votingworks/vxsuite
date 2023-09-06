import { Button } from '@votingworks/ui';
import React from 'react';
import { generateElectionBasedSubfolderName } from '@votingworks/utils';
import { ElectionDefinition } from '@votingworks/types';
import path from 'path';
import { FileType, SaveFrontendFileModal } from '../save_frontend_file_modal';

const REPORT_PDF_SUBFOLDER = 'report-pdfs';

export function ExportReportPdfButton({
  electionDefinition,
  generateReportPdf,
  defaultFilename,
  disabled,
}: {
  electionDefinition: ElectionDefinition;
  generateReportPdf: () => Promise<Uint8Array>;
  defaultFilename: string;
  disabled?: boolean;
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
          defaultDirectory={path.join(
            generateElectionBasedSubfolderName(
              electionDefinition.election,
              electionDefinition.electionHash
            ),
            REPORT_PDF_SUBFOLDER
          )}
          fileType={FileType.TallyReport}
        />
      )}
    </React.Fragment>
  );
}
