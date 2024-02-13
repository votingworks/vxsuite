import styled from 'styled-components';
import type { BatteryInfo as BatteryInfoType } from '@votingworks/backend';
import { format } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { IconProps, Icons } from './icons';
import { Font } from './typography';
import { useSystemCallApi } from './system_call_api';

const BatteryInfo = styled.div`
  align-self: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 2.1rem;
`;

const IconContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const BatteryPercentText = styled(Font)`
  font-size: 0.8em;
  line-height: 0.9;
`;

function getBatteryIcon(batteryInfo: BatteryInfoType): JSX.Element {
  assert(
    batteryInfo.level >= 0 && batteryInfo.level <= 1,
    'Invalid battery level'
  );
  const quarters = Math.round(batteryInfo.level * 4);
  const showDanger = quarters <= 1 && batteryInfo.discharging;
  const iconProps: IconProps = {
    color: showDanger ? 'danger' : undefined,
    style: { fontSize: '1.2em' },
  };

  switch (quarters) {
    case 0:
      return <Icons.BatteryEmpty {...iconProps} />;
    case 1:
      return <Icons.BatteryQuarter {...iconProps} />;
    case 2:
      return <Icons.BatteryHalf {...iconProps} />;
    case 3:
      return <Icons.BatteryThreeQuarters {...iconProps} />;
    case 4:
      return <Icons.BatteryFull {...iconProps} />;
    /* istanbul ignore next */
    default:
      throw new Error('Invalid battery level');
  }
}

export function BatteryDisplay(): JSX.Element {
  const systemCallApi = useSystemCallApi();
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  const batteryInfo = batteryInfoQuery.data;

  return (
    <BatteryInfo>
      <IconContainer>
        {batteryInfo ? getBatteryIcon(batteryInfo) : <Icons.BatteryFull />}
        {batteryInfo && !batteryInfo.discharging && (
          <Icons.Bolt style={{ fontSize: '0.8em' }} />
        )}
      </IconContainer>
      <BatteryPercentText weight="semiBold">
        {batteryInfo ? format.percent(batteryInfo.level) : '—-%'}
      </BatteryPercentText>
    </BatteryInfo>
  );
}
