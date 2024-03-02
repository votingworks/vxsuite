import type { BatteryInfo, DiskSpaceSummary } from '@votingworks/backend';
import { DiagnosticsRecord, PrinterStatus } from '@votingworks/types';
import { ThemeProvider } from 'styled-components';
import { LaptopSection } from './laptop_section';
import { PrinterSection } from './printer_section';
import { PrintedReport } from '../reports/layout';
import { makeTheme } from '../themes/make_theme';
import { ReadinessReportHeader } from './report_header';

interface ReportContentsProps {
  batteryInfo?: BatteryInfo;
  diskSpaceSummary: DiskSpaceSummary;
  printerStatus: PrinterStatus;
  mostRecentPrinterDiagnostic?: DiagnosticsRecord;
}

export function AdminReadinessReportContents({
  batteryInfo,
  diskSpaceSummary,
  printerStatus,
  mostRecentPrinterDiagnostic,
}: ReportContentsProps): JSX.Element {
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

export function AdminReadinessReport({
  generatedAtTime,
  machineId,
  ...contentProps
}: {
  generatedAtTime: Date;
  machineId: string;
} & ReportContentsProps): JSX.Element {
  return (
    <ThemeProvider
      theme={makeTheme({
        sizeMode: 'desktop',
        colorMode: 'desktop',
        screenType: 'builtIn',
      })}
    >
      <PrintedReport>
        <ReadinessReportHeader
          machineType="VxAdmin"
          generatedAtTime={generatedAtTime}
          machineId={machineId}
        />
        <AdminReadinessReportContents {...contentProps} />
      </PrintedReport>
    </ThemeProvider>
  );
}
