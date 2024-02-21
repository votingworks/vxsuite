import { H2, H6, Icons, P, PrinterStatusDisplay } from '@votingworks/ui';

import { format } from '@votingworks/utils';
import type { DiagnosticsRecord } from '@votingworks/admin-backend';
import type { BatteryInfo } from '@votingworks/backend';
import { NavigationScreen } from '../components/navigation_screen';
import {
  getDiagnosticRecords,
  getPrinterStatus,
  getApplicationDiskSpaceSummary,
  systemCallApi,
} from '../api';
import { Loading } from '../components/loading';
import { PrintTestPageButton } from '../components/print_diagnostic_button';

function roundToGigabytes(kilobytes: number): number {
  return Math.round(kilobytes / 100_000) / 10;
}

const DISK_SPACE_WARN_LEVEL = 0.05;

function BatteryStatusIcon({ discharging, level }: BatteryInfo): JSX.Element {
  if (discharging && level < 0.1) {
    return <Icons.Warning color="warning" />;
  }

  return <Icons.Done color="success" />;
}

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
  const storageAvailableLevel =
    diskSpaceSummary.available / diskSpaceSummary.total;
  const mostRecentPrinterDiagnostic = diagnosticRecordsQuery.data
    .filter(({ hardware }) => hardware === 'printer')
    .sort((a, b) => b.timestamp - a.timestamp)[0] as
    | DiagnosticsRecord
    | undefined;

  return (
    <NavigationScreen title="Hardware Diagnostics">
      <H2>Laptop</H2>
      <H6 as="h3">Power</H6>
      {batteryInfo ? (
        <P>
          <BatteryStatusIcon {...batteryInfo} /> Battery Level:{' '}
          {format.percent(batteryInfo.level)}
        </P>
      ) : (
        <P>
          <Icons.Done color="success" /> --%
        </P>
      )}
      <P>
        {batteryInfo?.discharging ? (
          <Icons.Info />
        ) : (
          <Icons.Done color="success" />
        )}{' '}
        Power Source:{' '}
        {batteryInfo
          ? batteryInfo.discharging
            ? 'Battery'
            : 'External Power Supply'
          : '-'}
      </P>
      <H6 as="h3">Storage</H6>
      <P>
        {storageAvailableLevel < DISK_SPACE_WARN_LEVEL ? (
          <Icons.Warning color="warning" />
        ) : (
          <Icons.Done color="success" />
        )}{' '}
        Free Disk Space: {format.percent(storageAvailableLevel)} (
        {roundToGigabytes(diskSpaceSummary.available)} GB /{' '}
        {roundToGigabytes(diskSpaceSummary.total)} GB)
      </P>
      <H2>Printer</H2>
      <PrinterStatusDisplay printerStatus={printerStatus} />
      {!mostRecentPrinterDiagnostic ? (
        <P>
          <Icons.Info /> No test print on record
        </P>
      ) : mostRecentPrinterDiagnostic.outcome === 'fail' ? (
        <P>
          <Icons.Warning color="warning" /> Test print failed,{' '}
          {new Date(mostRecentPrinterDiagnostic.timestamp).toLocaleString()}
        </P>
      ) : (
        <P>
          <Icons.Done color="success" /> Test print successful,{' '}
          {new Date(mostRecentPrinterDiagnostic.timestamp).toLocaleString()}
        </P>
      )}
      <PrintTestPageButton />
    </NavigationScreen>
  );
}
