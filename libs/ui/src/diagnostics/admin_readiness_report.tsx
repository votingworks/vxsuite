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
import { BallotStyleReadinessReport } from './ballot_style_readiness_report.js';

type ReportContentsProps = ConfigurationSectionProps &
  BatterySectionProps &
  StorageSectionProps &
  PrinterSectionProps;

export function AdminReadinessReportContents(
  props: ReportContentsProps
): JSX.Element {
  const { electionDefinition } = props;

  return (
    <ReportContents>
      <ConfigurationSection {...props} />
      <BatterySection {...props} />
      <StorageSection {...props} />
      <PrinterSection {...props} />
      {electionDefinition && (
        <BallotStyleReadinessReport electionDefinition={electionDefinition} />
      )}
    </ReportContents>
  );
}

type ClientReportContentsProps = ConfigurationSectionProps &
  BatterySectionProps &
  StorageSectionProps;

export function AdminClientReadinessReportContents(
  props: ClientReportContentsProps
): JSX.Element {
  const { electionDefinition } = props;

  return (
    <ReportContents>
      <ConfigurationSection {...props} />
      <BatterySection {...props} />
      <StorageSection {...props} />
      {electionDefinition && (
        <BallotStyleReadinessReport electionDefinition={electionDefinition} />
      )}
    </ReportContents>
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
          reportType="VxAdmin"
          generatedAtTime={generatedAtTime}
          machineId={machineId}
        />
        <AdminReadinessReportContents {...contentProps} />
      </PrintedReport>
    </ThemeProvider>
  );
}
