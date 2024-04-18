import { mockKiosk, mockPrinterInfo } from '@votingworks/test-utils';
import { KioskHardware } from './kiosk_hardware';

it('reads battery status from kiosk', async () => {
  const kiosk = mockKiosk();
  const hardware = new KioskHardware(kiosk);
  await hardware.readBatteryStatus();
  expect(kiosk.getBatteryInfo).toHaveBeenCalledTimes(1);
});

it('reports printer status as connected if there are any connected printers', async () => {
  const kiosk = mockKiosk();
  const hardware = new KioskHardware(kiosk);

  kiosk.getPrinterInfo.mockResolvedValueOnce([
    mockPrinterInfo({ connected: false }),
    mockPrinterInfo({ connected: true }),
  ]);

  expect(await hardware.readPrinterStatus()).toEqual(
    mockPrinterInfo({ connected: true })
  );
});

it('reports printer status as not connected if there are no connected printers', async () => {
  const kiosk = mockKiosk();
  const hardware = new KioskHardware(kiosk);

  kiosk.getPrinterInfo.mockResolvedValueOnce([
    mockPrinterInfo({ connected: false }),
  ]);

  expect(await hardware.readPrinterStatus()).toEqual(undefined);
});
