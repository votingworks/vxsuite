import {
  AdminReadinessReportContents,
  Loading,
  SaveReadinessReportButton,
} from '@votingworks/ui';

import styled from 'styled-components';
import { useContext } from 'react';
import { NavigationScreen } from '../components/navigation_screen.js';
import {
  getMostRecentPrinterDiagnostic,
  getPrinterStatus,
  getDiskSpaceSummary,
  saveReadinessReport,
  getUsbDriveStatus,
} from '../api.js';
import { systemCallApi } from '../shared_api.js';
import { PrintTestPageButton } from '../components/print_test_page_button.js';
import { NetworkSection } from '../components/network_section.js';
import { AppContext } from '../contexts/app_context.js';

const PageLayout = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
`;

export function DiagnosticsScreen(): JSX.Element {
  const { electionDefinition, electionPackageHash } = useContext(AppContext);
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  const printerStatusQuery = getPrinterStatus.usePollingQuery();
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
            // @coverage-defer
            batteryInfo={batteryInfo ?? undefined}
            diskSpaceSummary={diskSpaceSummary}
            printerStatus={printerStatus}
            mostRecentPrinterDiagnostic={mostRecentPrinterDiagnostic}
            electionDefinition={electionDefinition}
            electionPackageHash={electionPackageHash}
            printerDiagnosticUi={<PrintTestPageButton />}
            networkSectionUi={<NetworkSection />}
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
