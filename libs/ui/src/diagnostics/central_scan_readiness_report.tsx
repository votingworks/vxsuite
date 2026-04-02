import { ThemeProvider } from 'styled-components';
import {
  CentralScannerSection,
  CentralScannerSectionProps,
} from './central_scanner_section';
import { makeTheme } from '../themes/make_theme';
import { PrintedReport } from '../reports/layout';
import { ReadinessReportHeader } from './report_header';
import {
  ConfigurationSectionProps,
  ConfigurationSection,
  AllBallotStylesSection,
  MarkThresholdsSection,
  MarkThresholdsSectionProps,
} from './configuration_section';
import { ReportContents } from './components';
import { BatterySection, BatterySectionProps } from './battery_section';
import { StorageSection, StorageSectionProps } from './storage_section';
import {
  UninterruptiblePowerSupplySection,
  UpsSectionProps,
} from './uninterruptible_power_supply_section';

type ReportContentsProps = ConfigurationSectionProps &
  MarkThresholdsSectionProps &
  BatterySectionProps &
  StorageSectionProps &
  CentralScannerSectionProps &
  UpsSectionProps;

export function CentralScanReadinessReportContents(
  props: ReportContentsProps
): JSX.Element {
  const { electionDefinition, markThresholds } = props;

  return (
    <ReportContents>
      <ConfigurationSection {...props}>
        <AllBallotStylesSection election={electionDefinition?.election} />
        <MarkThresholdsSection markThresholds={markThresholds} />
      </ConfigurationSection>
      <BatterySection {...props} />
      <StorageSection {...props} />
      <UninterruptiblePowerSupplySection {...props} />
      <CentralScannerSection {...props} />
    </ReportContents>
  );
}

export function CentralScanReadinessReport({
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
          reportType="VxCentralScan"
          generatedAtTime={generatedAtTime}
          machineId={machineId}
        />
        <CentralScanReadinessReportContents {...contentProps} />
      </PrintedReport>
    </ThemeProvider>
  );
}
