import { ThemeProvider } from 'styled-components';
import { PrinterSection, PrinterSectionProps } from './printer_section';
import { PrintedReport } from '../reports/layout';
import { makeTheme } from '../themes/make_theme';
import { ReadinessReportHeader } from './report_header';
import {
  ConfigurationSectionProps,
  ConfigurationSection,
  PollingPlaceSectionProps,
  PollingPlaceSection,
} from './configuration_section';
import { ReportContents } from './components';
import { BatterySection, BatterySectionProps } from './battery_section';
import { StorageSection, StorageSectionProps } from './storage_section';

type ReportContentsProps = ConfigurationSectionProps &
  PollingPlaceSectionProps &
  BatterySectionProps &
  StorageSectionProps &
  PrinterSectionProps;

export function PrintReadinessReportContents(
  props: ReportContentsProps
): JSX.Element {
  const { electionDefinition, pollingPlaceId } = props;
  const election = electionDefinition?.election;

  return (
    <ReportContents>
      <ConfigurationSection {...props}>
        <PollingPlaceSection
          election={election}
          pollingPlaceId={pollingPlaceId}
        />
      </ConfigurationSection>
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
