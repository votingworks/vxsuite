import {
  AdminReadinessReportContents,
  SaveReadinessReportButton,
} from '@votingworks/ui';

import styled from 'styled-components';
import { useContext } from 'react';
import { NavigationScreen } from '../components/navigation_screen';
import {
  getMostRecentPrinterDiagnostic,
  getPrinterStatus,
  getDiskSpaceSummary,
  systemCallApi,
  saveReadinessReport,
  getUsbDriveStatus,
} from '../api';
import { Loading } from '../components/loading';
import { PrintTestPageButton } from '../components/print_diagnostic_button';
import { AppContext } from '../contexts/app_context';

const PageLayout = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
`;

export function DiagnosticsScreen(): JSX.Element {
  const { electionDefinition, electionPackageHash } = useContext(AppContext);
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  const printerStatusQuery = getPrinterStatus.useQuery();
  const diskSpaceQuery = getDiskSpaceSummary.useQuery();
  const diagnosticRecordQuery = getMostRecentPrinterDiagnostic.useQuery();
  const saveReadinessReportMutation = saveReadinessReport.useMutation();
  const getUsbDriveStatusQuery = getUsbDriveStatus.useQuery();

  if (
    !batteryInfoQuery.isSuccess ||
    !printerStatusQuery.isSuccess ||
    !diagnosticRecordQuery.isSuccess ||
    !diskSpaceQuery.isSuccess ||
    !getUsbDriveStatusQuery.isSuccess
  ) {
    return (
      <NavigationScreen title="Diagnostics">
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  const batteryInfo = batteryInfoQuery.data;
  const printerStatus = printerStatusQuery.data;
  const diskSpaceSummary = diskSpaceQuery.data;
  const mostRecentPrinterDiagnostic = diagnosticRecordQuery.data ?? undefined;

  return (
    <NavigationScreen title="Diagnostics">
      <PageLayout>
        <div>
          <AdminReadinessReportContents
            batteryInfo={batteryInfo ?? undefined}
            diskSpaceSummary={diskSpaceSummary}
            printerStatus={printerStatus}
            mostRecentPrinterDiagnostic={mostRecentPrinterDiagnostic}
            electionDefinition={electionDefinition}
            electionPackageHash={electionPackageHash}
            printerDiagnosticUi={<PrintTestPageButton />}
            omitConfigSectionBallotStyles
          />
        </div>
        <SaveReadinessReportButton
          usbDriveStatus={getUsbDriveStatusQuery.data}
          saveReadinessReportMutation={saveReadinessReportMutation}
        />
      </PageLayout>
    </NavigationScreen>
  );
}
