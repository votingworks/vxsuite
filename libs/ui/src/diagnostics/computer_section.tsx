import type { BatteryInfo, DiskSpaceSummary } from '@votingworks/backend';
import React from 'react';
import { format } from '@votingworks/utils';
import { H2, H6, P } from '../typography';
import { InfoIcon, SuccessIcon, WarningIcon } from './icons';

export const FREE_DISK_SPACE_RATIO_WARN_THRESHOLD = 0.05;

function roundToGigabytes(kilobytes: number): number {
  return Math.round(kilobytes / 100_000) / 10;
}

function warnOnBatteryInfo({ discharging, level }: BatteryInfo): boolean {
  return discharging && level < 0.1;
}

function PowerSection({
  batteryInfo,
}: {
  batteryInfo?: BatteryInfo;
}): JSX.Element {
  if (!batteryInfo) {
    return (
      <React.Fragment>
        <H6 as="h3">Power</H6>
        <P>
          <SuccessIcon /> Battery Level: 100%
        </P>
        <P>
          <SuccessIcon /> Power Source: Unknown
        </P>
      </React.Fragment>
    );
  }

  return (
    <React.Fragment>
      <H6 as="h3">Power</H6>
      <P>
        {warnOnBatteryInfo(batteryInfo) ? <WarningIcon /> : <SuccessIcon />}{' '}
        Battery Level: {format.percent(batteryInfo.level)}
      </P>
      {batteryInfo.discharging ? (
        <P>
          <InfoIcon /> Power Source: Battery
        </P>
      ) : (
        <P>
          <SuccessIcon /> Power Source: External Power Supply
        </P>
      )}
    </React.Fragment>
  );
}

function StorageSection({
  diskSpaceSummary,
}: {
  diskSpaceSummary: DiskSpaceSummary;
}): JSX.Element {
  const storageAvailableRatio =
    diskSpaceSummary.available / diskSpaceSummary.total;

  return (
    <React.Fragment>
      <H6 as="h3">Storage</H6>
      <P>
        {storageAvailableRatio < FREE_DISK_SPACE_RATIO_WARN_THRESHOLD ? (
          <WarningIcon />
        ) : (
          <SuccessIcon />
        )}{' '}
        Free Disk Space: {format.percent(storageAvailableRatio)} (
        {roundToGigabytes(diskSpaceSummary.available)} GB /{' '}
        {roundToGigabytes(diskSpaceSummary.total)} GB)
      </P>
    </React.Fragment>
  );
}

export interface ComputerSectionProps {
  batteryInfo?: BatteryInfo;
  diskSpaceSummary: DiskSpaceSummary;
}

export function ComputerSection({
  batteryInfo,
  diskSpaceSummary,
}: ComputerSectionProps): JSX.Element {
  return (
    <React.Fragment>
      <H2>Computer</H2>
      <PowerSection batteryInfo={batteryInfo} />
      <StorageSection diskSpaceSummary={diskSpaceSummary} />
    </React.Fragment>
  );
}
