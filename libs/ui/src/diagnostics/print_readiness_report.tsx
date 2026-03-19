import { ThemeProvider } from 'styled-components';
import { PrinterSection, PrinterSectionProps } from './printer_section.js';
import { PrintedReport } from '../reports/layout.js';
import { makeTheme } from '../themes/make_theme.js';
import { ReadinessReportHeader } from './report_header.js';
import {
  ConfigurationSectionProps,
  ConfigurationSection,
} from './configuration_section.js';
import { ReportContents } from './components.js';
import { BatterySection, BatterySectionProps } from './battery_section.js';
import { StorageSection, StorageSectionProps } from './storage_section.js';

type ReportContentsProps = ConfigurationSectionProps &
  BatterySectionProps &
  StorageSectionProps &
  PrinterSectionProps;

export function PrintReadinessReportContents(
  props: ReportContentsProps
): JSX.Element {
  return (
    <ReportContents>
      <ConfigurationSection {...props} />
      <BatterySection {...props} />
      <StorageSection {...props} />
      <PrinterSection {...props} />
    </ReportContents>
  );
}

export function PrintReadinessReport({
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
          reportType="VxPrint"
          generatedAtTime={generatedAtTime}
          machineId={machineId}
        />
        <PrintReadinessReportContents {...contentProps} />
      </PrintedReport>
    </ThemeProvider>
  );
}
