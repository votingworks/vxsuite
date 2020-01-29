import fetchMock from 'fetch-mock'
import fakeKiosk, {
  fakeDevice,
  fakePrinterInfo,
} from '../../test/helpers/fakeKiosk'
import { getHardware, KioskHardware, WebBrowserHardware } from './Hardware'

describe('KioskHardware', () => {
  it('is used by getHardware when window.kiosk is set', () => {
    try {
      window.kiosk = fakeKiosk()
      const hardware = getHardware()
      expect(hardware).toBeInstanceOf(KioskHardware)
    } finally {
      window.kiosk = undefined
    }
  })

  it('is not used by getHardware when window.kiosk is not set', () => {
    expect(window.kiosk).toBeUndefined()
    const hardware = getHardware()
    expect(hardware).not.toBeInstanceOf(KioskHardware)
  })

  it('reads battery status from kiosk', async () => {
    const kiosk = fakeKiosk()
    const hardware = new KioskHardware(kiosk)
    await hardware.readBatteryStatus()
    expect(kiosk.getBatteryInfo).toHaveBeenCalledTimes(1)
  })

  it('sees an accessible controller if a device with the right vendor id & product id is present', async () => {
    const kiosk = fakeKiosk()
    const hardware = new KioskHardware(kiosk)

    kiosk.getDeviceList.mockResolvedValueOnce([
      fakeDevice({
        vendorId: 0x0d8c,
        productId: 0x0170,
      }),
    ])

    expect(await hardware.readAccesssibleControllerStatus()).toEqual({
      connected: true,
    })
  })

  it('does not see an accessible controller if no device with the right vendor id & product id is present', async () => {
    const kiosk = fakeKiosk()
    const hardware = new KioskHardware(kiosk)

    kiosk.getDeviceList.mockResolvedValueOnce([
      fakeDevice({ vendorId: 0x0001, productId: 0x0001 }),
    ])

    expect(await hardware.readAccesssibleControllerStatus()).toEqual({
      connected: false,
    })
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
})

describe('WebBrowserHardware', () => {
  it('gets card reader status by checking /card/reader', async () => {
    const hardware = new WebBrowserHardware()

    fetchMock.get('/card/reader', () => JSON.stringify({ connected: true }))

    expect(await hardware.readCardReaderStatus()).toEqual({ connected: true })
  })
})
