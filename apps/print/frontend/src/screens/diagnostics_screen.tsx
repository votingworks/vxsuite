import {
  PrintReadinessReportContents,
  SaveReadinessReportButton,
} from '@votingworks/ui';
import styled from 'styled-components';
import { Loading } from '@votingworks/ui';
import { ScreenWrapper } from '../components/screen_wrapper';
import { TitleBar } from '../components/title_bar';
import {
  getMostRecentPrinterDiagnostic,
  getDeviceStatuses,
  getDiskSpaceSummary,
  saveReadinessReport,
  getElectionRecord,
} from '../api';
import { PrintTestPageButton } from '../components/print_diagnostic_button';

const PageLayout = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
`;

const Content = styled.div`
  padding: 1rem;
`;

export function DiagnosticsScreen({
  authType,
}: {
  authType: 'system_admin' | 'election_manager';
}): JSX.Element {
  const deviceStatusesQuery = getDeviceStatuses.useQuery();
  const diskSpaceQuery = getDiskSpaceSummary.useQuery();
  const diagnosticRecordQuery = getMostRecentPrinterDiagnostic.useQuery();
  const saveReadinessReportMutation = saveReadinessReport.useMutation();
  const electionRecordQuery = getElectionRecord.useQuery();

  if (
    !deviceStatusesQuery.isSuccess ||
    !diagnosticRecordQuery.isSuccess ||
    !diskSpaceQuery.isSuccess ||
    !electionRecordQuery.isSuccess
  ) {
    return (
      <ScreenWrapper authType={authType}>
        <TitleBar title="Diagnostics" />
        <Loading isFullscreen />
      </ScreenWrapper>
    );
  }

  const {
    battery: batteryInfo,
    printer: printerStatus,
    usbDrive: usbDriveStatus,
  } = deviceStatusesQuery.data;
  const diskSpaceSummary = diskSpaceQuery.data;
  const mostRecentPrinterDiagnostic = diagnosticRecordQuery.data ?? undefined;
  const electionRecord = electionRecordQuery.data;

  return (
    <ScreenWrapper authType={authType}>
      <TitleBar title="Diagnostics" />
      <Content>
        <PageLayout>
          <div>
            <PrintReadinessReportContents
              batteryInfo={batteryInfo ?? undefined}
              diskSpaceSummary={diskSpaceSummary}
              printerStatus={printerStatus}
              mostRecentPrinterDiagnostic={mostRecentPrinterDiagnostic}
              electionDefinition={electionRecord?.electionDefinition}
              electionPackageHash={electionRecord?.electionPackageHash}
              printerDiagnosticUi={<PrintTestPageButton />}
            />
          </div>
          <SaveReadinessReportButton
            usbDriveStatus={usbDriveStatus}
            saveReadinessReportMutation={saveReadinessReportMutation}
          />
        </PageLayout>
      </Content>
    </ScreenWrapper>
  );
}
