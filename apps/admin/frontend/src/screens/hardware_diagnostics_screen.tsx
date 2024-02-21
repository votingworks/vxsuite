import { AdminReadinessReportContents } from '@votingworks/ui';

import { DiagnosticsRecord } from '@votingworks/types';
import { NavigationScreen } from '../components/navigation_screen';
import {
  getDiagnosticRecords,
  getPrinterStatus,
  getApplicationDiskSpaceSummary,
  systemCallApi,
} from '../api';
import { Loading } from '../components/loading';
import { PrintTestPageButton } from '../components/print_diagnostic_button';

export function HardwareDiagnosticsScreen(): JSX.Element {
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  const printerStatusQuery = getPrinterStatus.useQuery();
  const diskSpaceQuery = getApplicationDiskSpaceSummary.useQuery();
  const diagnosticRecordsQuery = getDiagnosticRecords.useQuery();

  if (
    !batteryInfoQuery.isSuccess ||
    !printerStatusQuery.isSuccess ||
    !diagnosticRecordsQuery.isSuccess ||
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
  const mostRecentPrinterDiagnostic = diagnosticRecordsQuery.data
    .filter(({ hardware }) => hardware === 'printer')
    .sort((a, b) => b.timestamp - a.timestamp)[0] as
    | DiagnosticsRecord
    | undefined;

  return (
    <NavigationScreen title="Hardware Diagnostics">
      <AdminReadinessReportContents
        batteryInfo={batteryInfo ?? undefined}
        diskSpaceSummary={diskSpaceSummary}
        printerStatus={printerStatus}
        mostRecentPrinterDiagnostic={mostRecentPrinterDiagnostic}
      />
      <PrintTestPageButton />
    </NavigationScreen>
  );
}
