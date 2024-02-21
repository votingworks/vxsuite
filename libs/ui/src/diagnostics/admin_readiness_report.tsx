import type { BatteryInfo, DiskSpaceSummary } from '@votingworks/backend';
import { DiagnosticsRecord, PrinterStatus } from '@votingworks/types';
import styled, { ThemeProvider } from 'styled-components';
import { LaptopSection } from './laptop_section';
import { PrinterSection } from './printer_section';
import { PrintedReport } from '../reports/layout';
import { makeTheme } from '../themes/make_theme';
import { ReadinessReportHeader } from './report_header';

export function AdminReadinessReportContents({
  batteryInfo,
  diskSpaceSummary,
  printerStatus,
  mostRecentPrinterDiagnostic,
}: {
  batteryInfo?: BatteryInfo;
  diskSpaceSummary: DiskSpaceSummary;
  printerStatus: PrinterStatus;
  mostRecentPrinterDiagnostic?: DiagnosticsRecord;
}): JSX.Element {
  return (
    <div>
      <LaptopSection
        batteryInfo={batteryInfo}
        diskSpaceSummary={diskSpaceSummary}
      />
      <PrinterSection
        printerStatus={printerStatus}
        mostRecentPrinterDiagnostic={mostRecentPrinterDiagnostic}
      />
    </div>
  );
}

/**
 * Override the icon colors to be black for the printed report, otherwise
 * light icons like the warning icon will be hard to see.
 */
const PrintedReadinessReport = styled(PrintedReport)`
  svg {
    color: black !important;
  }
`;

export function AdminReadinessReport({
  batteryInfo,
  diskSpaceSummary,
  printerStatus,
  mostRecentPrinterDiagnostic,
  generatedAtTime,
  machineId,
}: {
  batteryInfo?: BatteryInfo;
  diskSpaceSummary: DiskSpaceSummary;
  printerStatus: PrinterStatus;
  mostRecentPrinterDiagnostic?: DiagnosticsRecord;
  generatedAtTime: Date;
  machineId: string;
}): JSX.Element {
  return (
    <ThemeProvider
      theme={makeTheme({
        sizeMode: 'desktop',
        colorMode: 'desktop',
        screenType: 'builtIn',
      })}
    >
      <PrintedReadinessReport>
        <ReadinessReportHeader
          machineType="VxAdmin"
          generatedAtTime={generatedAtTime}
          machineId={machineId}
        />
        <AdminReadinessReportContents
          batteryInfo={batteryInfo}
          diskSpaceSummary={diskSpaceSummary}
          printerStatus={printerStatus}
          mostRecentPrinterDiagnostic={mostRecentPrinterDiagnostic}
        />
      </PrintedReadinessReport>
    </ThemeProvider>
  );
}
