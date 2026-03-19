import { ThemeProvider } from 'styled-components';
import {
  CentralScannerSection,
  CentralScannerSectionProps,
} from './central_scanner_section.js';
import { makeTheme } from '../themes/make_theme.js';
import { PrintedReport } from '../reports/layout.js';
import { ReadinessReportHeader } from './report_header.js';
import {
  ConfigurationSectionProps,
  ConfigurationSection,
} from './configuration_section.js';
import { ReportContents } from './components.js';
import { BatterySection, BatterySectionProps } from './battery_section.js';
import { StorageSection, StorageSectionProps } from './storage_section.js';
import {
  UninterruptiblePowerSupplySection,
  UpsSectionProps,
} from './uninterruptible_power_supply_section.js';

type ReportContentsProps = ConfigurationSectionProps &
  BatterySectionProps &
  StorageSectionProps &
  CentralScannerSectionProps &
  UpsSectionProps;

export function CentralScanReadinessReportContents(
  props: ReportContentsProps
): JSX.Element {
  return (
    <ReportContents>
      <ConfigurationSection {...props} />
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
