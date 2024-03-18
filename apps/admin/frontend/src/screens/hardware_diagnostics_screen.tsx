import { AdminReadinessReportContents } from '@votingworks/ui';

import styled from 'styled-components';
import { NavigationScreen } from '../components/navigation_screen';
import {
  getMostRecentPrinterDiagnostic,
  getPrinterStatus,
  getApplicationDiskSpaceSummary,
  systemCallApi,
  printReadinessReport,
} from '../api';
import { Loading } from '../components/loading';
import { PrintTestPageButton } from '../components/print_diagnostic_button';
import { PrintButton } from '../components/print_button';

const PageLayout = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
`;

export function HardwareDiagnosticsScreen(): JSX.Element {
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  const printerStatusQuery = getPrinterStatus.useQuery();
  const diskSpaceQuery = getApplicationDiskSpaceSummary.useQuery();
  const diagnosticRecordQuery = getMostRecentPrinterDiagnostic.useQuery();
  const printReadinessReportMutation = printReadinessReport.useMutation();

  if (
    !batteryInfoQuery.isSuccess ||
    !printerStatusQuery.isSuccess ||
    !diagnosticRecordQuery.isSuccess ||
    !diskSpaceQuery.isSuccess
  ) {
    return (
      <NavigationScreen title="Hardware Diagnostics">
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  const batteryInfo = batteryInfoQuery.data;
  const printerStatus = printerStatusQuery.data;
  const diskSpaceSummary = diskSpaceQuery.data;
  const mostRecentPrinterDiagnostic = diagnosticRecordQuery.data ?? undefined;

  return (
    <NavigationScreen title="Hardware Diagnostics">
      <PageLayout>
        <div>
          <AdminReadinessReportContents
            batteryInfo={batteryInfo ?? undefined}
            diskSpaceSummary={diskSpaceSummary}
            printerStatus={printerStatus}
            mostRecentPrinterDiagnostic={mostRecentPrinterDiagnostic}
          />
          <PrintTestPageButton />
        </div>
        <PrintButton print={() => printReadinessReportMutation.mutateAsync()}>
          Print Readiness Report
        </PrintButton>
      </PageLayout>
    </NavigationScreen>
  );
}
