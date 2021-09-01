import { fakeKiosk, fakePrinterInfo } from '@votingworks/test-utils'
import KioskHardware from './KioskHardware'

it('reads battery status from kiosk', async () => {
  const kiosk = fakeKiosk()
  const hardware = new KioskHardware(kiosk)
  await hardware.readBatteryStatus()
  expect(kiosk.getBatteryInfo).toHaveBeenCalledTimes(1)
})

it('reports printer status as connected if there are any connected printers', async () => {
  const kiosk = fakeKiosk()
  const hardware = new KioskHardware(kiosk)

  kiosk.getPrinterInfo.mockResolvedValueOnce([
    fakePrinterInfo({ connected: false }),
    fakePrinterInfo({ connected: true }),
  ])

  expect(await hardware.readPrinterStatus()).toEqual({ connected: true })
})

it('reports printer status as not connected if there are no connected printers', async () => {
  const kiosk = fakeKiosk()
  const hardware = new KioskHardware(kiosk)

  kiosk.getPrinterInfo.mockResolvedValueOnce([
    fakePrinterInfo({ connected: false }),
  ])

  expect(await hardware.readPrinterStatus()).toEqual({ connected: false })
})
