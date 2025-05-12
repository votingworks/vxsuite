import { ThemeProvider } from 'styled-components';
import { PrinterSection, PrinterSectionProps } from './printer_section';
import { PrintedReport } from '../reports/layout';
import { makeTheme } from '../themes/make_theme';
import { ReadinessReportHeader } from './report_header';
import {
  ConfigurationSectionProps,
  ConfigurationSection,
} from './configuration_section';
import { ReportContents } from './components';
import { BatterySection, BatterySectionProps } from './battery_section';
import { StorageSection, StorageSectionProps } from './storage_section';
import { BallotStyleReadinessReport } from './ballot_style_readiness_report';

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
