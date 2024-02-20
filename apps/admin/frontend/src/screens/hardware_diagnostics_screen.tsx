import { H2, Icons, P, PrinterStatusDisplay } from '@votingworks/ui';

import { format } from '@votingworks/utils';
import type { DiagnosticsRecord } from '@votingworks/admin-backend';
import type { BatteryInfo } from '@votingworks/backend';
import { NavigationScreen } from '../components/navigation_screen';
import { getDiagnosticRecords, getPrinterStatus, systemCallApi } from '../api';
import { Loading } from '../components/loading';
import { PrintTestPageButton } from '../components/print_diagnostic_button';

function BatteryStatusIcon({ discharging, level }: BatteryInfo): JSX.Element {
  if (discharging && level < 0.1) {
    return <Icons.Warning color="warning" />;
  }

  return <Icons.Done color="success" />;
}

export function HardwareDiagnosticsScreen(): JSX.Element {
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  const printerStatusQuery = getPrinterStatus.useQuery();
  const diagnosticRecordsQuery = getDiagnosticRecords.useQuery();

  if (
    !batteryInfoQuery.isSuccess ||
    !printerStatusQuery.isSuccess ||
    !diagnosticRecordsQuery.isSuccess
  ) {
    return (
      <NavigationScreen title="Hardware Diagnostics">
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  const batteryInfo = batteryInfoQuery.data;
  const printerStatus = printerStatusQuery.data;
  const mostRecentPrinterDiagnostic = diagnosticRecordsQuery.data
    .filter(({ hardware }) => hardware === 'printer')
    .sort((a, b) => b.timestamp - a.timestamp)[0] as
    | DiagnosticsRecord
    | undefined;

  return (
    <NavigationScreen title="Hardware Diagnostics">
      <H2>Laptop</H2>
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
