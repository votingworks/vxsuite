import { Font, H2, Icons, P } from '@votingworks/ui';

import { format } from '@votingworks/utils';
import { NavigationScreen } from '../components/navigation_screen';
import { getPrinterStatus, systemCallApi } from '../api';
import { Loading } from '../components/loading';

export function HardwareDiagnosticsScreen(): JSX.Element {
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  const printerStatusQuery = getPrinterStatus.useQuery();

  if (!batteryInfoQuery.isSuccess || !printerStatusQuery.isSuccess) {
    return (
      <NavigationScreen title="Hardware Diagnostics">
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  const batteryInfo = batteryInfoQuery.data;
  const printerStatus = printerStatusQuery.data;

  return (
    <NavigationScreen title="Hardware Diagnostics">
      <H2>Laptop</H2>
      <P>
        <Font weight="semiBold">Power Source:</Font>{' '}
        {batteryInfo
          ? batteryInfo.discharging
            ? 'Battery'
            : 'External Power Supply'
          : '-'}
      </P>
      <P>
        <Font weight="semiBold">Battery Level:</Font>{' '}
        {batteryInfo ? format.percent(batteryInfo.level) : '--%'}
      </P>
      <H2>Printer</H2>
      {printerStatus.connected ? (
        <P>
          <Icons.Done color="success" /> Connected
        </P>
      ) : (
        <P>
          <Icons.Info /> No compatible printer detected
        </P>
      )}
    </NavigationScreen>
  );
}
