import { ThemeProvider } from 'styled-components';
import { ComputerSection, ComputerSectionProps } from './computer_section';
import { PrinterSection, PrinterSectionProps } from './printer_section';
import { PrintedReport } from '../reports/layout';
import { makeTheme } from '../themes/make_theme';
import { ReadinessReportHeader } from './report_header';
import {
  ConfigurationSectionProps,
  ConfigurationSection,
} from './configuration_section';

type ReportContentsProps = ComputerSectionProps &
  PrinterSectionProps &
  ConfigurationSectionProps;

export function AdminReadinessReportContents(
  props: ReportContentsProps
): JSX.Element {
  return (
    <div>
      <ConfigurationSection {...props} />
      <ComputerSection {...props} />
      <PrinterSection {...props} />
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
