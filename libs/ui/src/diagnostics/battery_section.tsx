import type { BatteryInfo } from '@votingworks/backend';
import { format } from '@votingworks/utils';
import { H2, P } from '../typography';
import { InfoIcon, SuccessIcon, WarningIcon } from './icons';

export const FREE_DISK_SPACE_RATIO_WARN_THRESHOLD = 0.05;

function warnOnBatteryInfo({ discharging, level }: BatteryInfo): boolean {
  return discharging && level < 0.1;
}

export interface BatterySectionProps {
  batteryInfo?: BatteryInfo;
}

export function BatterySection({
  batteryInfo,
}: BatterySectionProps): JSX.Element {
  if (!batteryInfo) {
    return (
      <section>
        <H2>Battery</H2>
        <P>
          <SuccessIcon /> Battery Level: 100%
        </P>
        <P>
          <SuccessIcon /> Power Source: Unknown
        </P>
      </section>
    );
  }

  return (
    <section>
      <H2>Battery</H2>
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
    </section>
  );
}
