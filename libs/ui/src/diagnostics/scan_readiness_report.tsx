import { ThemeProvider } from 'styled-components';
import { ComputerSection, ComputerSectionProps } from './computer_section';
import { makeTheme } from '../themes/make_theme';
import { PrintedReport } from '../reports/layout';
import { ReadinessReportHeader } from './report_header';
import {
  ConfigurationSectionProps,
  ConfigurationSection,
} from './configuration_section';
import { ReportContents } from './components';
import {
  ThermalPrinterSection,
  ThermalPrinterSectionProps,
} from './thermal_printer_section';

type ReportContentsProps = ComputerSectionProps &
  ThermalPrinterSectionProps &
  ConfigurationSectionProps;

export function ScanReadinessReportContents(
  props: ReportContentsProps
): JSX.Element {
  return (
    <ReportContents>
      <ConfigurationSection {...props} />
      <ComputerSection {...props} />
      <ThermalPrinterSection {...props} />
    </ReportContents>
  );
}

export function ScanReadinessReport({
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
          reportType="VxScan"
          generatedAtTime={generatedAtTime}
          machineId={machineId}
        />
        <ScanReadinessReportContents {...contentProps} />
      </PrintedReport>
    </ThemeProvider>
  );
}
