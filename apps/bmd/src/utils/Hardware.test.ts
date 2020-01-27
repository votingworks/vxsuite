import fetchMock from 'fetch-mock'
import fakeKiosk, {
  fakeDevice,
  fakePrinterInfo,
} from '../../test/helpers/fakeKiosk'
import {
  getHardware,
  KioskHardware,
  WebBrowserHardware,
  MemoryHardware,
} from './Hardware'

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

describe('MemoryHardware', () => {
  it('triggers callbacks when adding devices', () => {
    const hardware = new MemoryHardware()
    const callback = jest.fn()
    const device = fakeDevice()

    hardware.onDeviceChange.add(callback)
    expect(callback).not.toHaveBeenCalled()

    hardware.addDevice(device)
    expect(callback).toHaveBeenCalledWith(0 /* ChangeType.Add */, device)
  })

  it('triggers callbacks when removing devices', () => {
    const hardware = new MemoryHardware()
    const callback = jest.fn()
    const device = fakeDevice()

    hardware.addDevice(device)

    hardware.onDeviceChange.add(callback)
    expect(callback).not.toHaveBeenCalled()

    hardware.removeDevice(device)
    expect(callback).toHaveBeenCalledWith(1 /* ChangeType.Remove */, device)
  })

  it('throws when adding the same device twice', () => {
    const hardware = new MemoryHardware()
    const device = fakeDevice()

    hardware.addDevice(device)
    expect(() => hardware.addDevice(device)).toThrowError(/already added/)
  })

  it('throws when removing a device that was never added', () => {
    const hardware = new MemoryHardware()
    const device = fakeDevice()

    expect(() => hardware.removeDevice(device)).toThrowError(/never added/)
  })

  it('allows removing callbacks by passing them to remove', () => {
    const hardware = new MemoryHardware()
    const callback = jest.fn()
    const device = fakeDevice()

    hardware.onDeviceChange.add(callback)
    hardware.onDeviceChange.remove(callback)

    hardware.addDevice(device)
    expect(callback).not.toHaveBeenCalled()
  })

  it('allows removing callbacks by calling remove on the returned listener', () => {
    const hardware = new MemoryHardware()
    const callback = jest.fn()
    const device = fakeDevice()

    hardware.onDeviceChange.add(callback).remove()

    hardware.addDevice(device)
    expect(callback).not.toHaveBeenCalled()
  })
})
