import { ThemeProvider } from 'styled-components';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { makeTheme } from '../themes/make_theme';
import { PrintedReport } from '../reports/layout';
import { ReadinessReportHeader } from './report_header';
import {
  ConfigurationSectionProps,
  ConfigurationSection,
  PrecinctSelectionSection,
  MarkThresholdsSection,
  MarkThresholdsSectionProps,
  PrecinctSelectionSectionProps,
  PollingPlaceSection,
  PollingPlaceSectionProps,
} from './configuration_section';
import { ReportContents } from './components';
import {
  ThermalPrinterSection,
  ThermalPrinterSectionProps,
} from './thermal_printer_section';
import { StorageSection, StorageSectionProps } from './storage_section';
import { ScanAudioSection, ScanAudioSectionProps } from './scan_audio_section';
import {
  PrecinctScannerSection,
  PrecinctScannerSectionProps,
} from './precinct_scanner_section';
import {
  UninterruptiblePowerSupplySection,
  UpsSectionProps,
} from './uninterruptible_power_supply_section';

type ReportContentsProps = ConfigurationSectionProps &
  MarkThresholdsSectionProps &
  PrecinctSelectionSectionProps &
  PollingPlaceSectionProps &
  StorageSectionProps &
  PrecinctScannerSectionProps &
  ThermalPrinterSectionProps &
  ScanAudioSectionProps &
  UpsSectionProps;

export function ScanReadinessReportContents(
  props: ReportContentsProps
): JSX.Element {
  const { ENABLE_POLLING_PLACES } = BooleanEnvironmentVariableName;
  const {
    electionDefinition,
    markThresholds,
    pollingPlaceId,
    precinctSelection,
  } = props;
  const election = electionDefinition?.election;

  return (
    <ReportContents>
      <ConfigurationSection {...props}>
        {isFeatureFlagEnabled(ENABLE_POLLING_PLACES) ? (
          <PollingPlaceSection
            election={election}
            pollingPlaceId={pollingPlaceId}
          />
        ) : (
          <PrecinctSelectionSection
            election={election}
            precinctSelection={precinctSelection}
          />
        )}
        <MarkThresholdsSection markThresholds={markThresholds} />
      </ConfigurationSection>
      <StorageSection {...props} />
      <PrecinctScannerSection {...props} />
      <ThermalPrinterSection {...props} />
      <ScanAudioSection {...props} />
      <UninterruptiblePowerSupplySection {...props} />
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
