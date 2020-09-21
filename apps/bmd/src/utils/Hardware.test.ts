import fakeKiosk, {
  fakeDevice,
  fakePrinterInfo,
} from '../../test/helpers/fakeKiosk'
import {
  getHardware,
  KioskHardware,
  MemoryHardware,
  isCardReader,
  OmniKeyCardReaderVendorId,
  OmniKeyCardReaderProductId,
  OmniKeyCardReaderDeviceName,
  OmniKeyCardReaderManufacturer,
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

describe('MemoryHardware', () => {
  it('has a standard config with all the typical hardware', (done) => {
    const hardware = MemoryHardware.standard

    hardware.devices.subscribe((devices) => {
      expect(
        new Set(Array.from(devices).map((device) => device.deviceName))
      ).toEqual(
        new Set([
          OmniKeyCardReaderDeviceName,
          'USB Advanced Audio Device',
          'HL-L5100DN_series',
        ])
      )

      done()
    })
  })

  it('has no connected devices by default', (done) => {
    const hardware = new MemoryHardware()

    hardware.devices.subscribe((devices) => {
      expect(Array.from(devices)).toEqual([])
      done()
    })
  })

  it('does not have devices that have not been added', () => {
    const hardware = new MemoryHardware()
    expect(hardware.hasDevice(fakeDevice())).toBe(false)
  })

  it('has devices that have been added', () => {
    const hardware = new MemoryHardware()
    const device = fakeDevice()

    hardware.addDevice(device)
    expect(hardware.hasDevice(device)).toBe(true)
  })

  it('sets connected to true by adding a missing device', () => {
    const hardware = new MemoryHardware()
    const device = fakeDevice()

    jest.spyOn(hardware, 'addDevice')
    hardware.setDeviceConnected(device, true)
    expect(hardware.hasDevice(device)).toBe(true)
    expect(hardware.addDevice).toHaveBeenCalledWith(device)
  })

  it('does nothing when setting connected to true for an already added device', () => {
    const hardware = new MemoryHardware()
    const device = fakeDevice()

    hardware.addDevice(device)
    jest.spyOn(hardware, 'addDevice')
    hardware.setDeviceConnected(device, true)
    expect(hardware.hasDevice(device)).toBe(true)
    expect(hardware.addDevice).not.toHaveBeenCalled()
  })

  it('sets connected to false by removing a connected device', () => {
    const hardware = new MemoryHardware()
    const device = fakeDevice()

    hardware.addDevice(device)
    jest.spyOn(hardware, 'removeDevice')
    hardware.setDeviceConnected(device, false)
    expect(hardware.hasDevice(device)).toBe(false)
    expect(hardware.removeDevice).toHaveBeenCalledWith(device)
  })

  it('does nothing when setting connected to false for an already missing device', () => {
    const hardware = new MemoryHardware()
    const device = fakeDevice()

    jest.spyOn(hardware, 'removeDevice')
    hardware.setDeviceConnected(device, false)
    expect(hardware.hasDevice(device)).toBe(false)
    expect(hardware.removeDevice).not.toHaveBeenCalled()
  })

  it('triggers callbacks when adding devices', () => {
    const hardware = new MemoryHardware()
    const callback = jest.fn()
    const device = fakeDevice()

    hardware.devices.subscribe(callback)
    hardware.addDevice(device)
    expect(callback).toHaveBeenCalledWith(new Set([device]))
  })

  it('triggers callbacks when removing devices', () => {
    const hardware = new MemoryHardware()
    const callback = jest.fn()
    const device = fakeDevice()

    hardware.addDevice(device)

    hardware.devices.subscribe(callback)
    expect(callback).toHaveBeenNthCalledWith(1, new Set([device]))

    hardware.removeDevice(device)
    expect(callback).toHaveBeenNthCalledWith(2, new Set([]))
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

  it('allows unsubscribing from a device subscription', () => {
    const hardware = new MemoryHardware()
    const callback = jest.fn()
    const device = fakeDevice()

    hardware.devices.subscribe(callback).unsubscribe()
    callback.mockClear()

    hardware.addDevice(device)
    expect(callback).not.toHaveBeenCalled()
  })
})

describe('isCardReader', () => {
  it('does not match just any device', () => {
    expect(isCardReader(fakeDevice())).toBe(false)
  })

  it('matches a device with the right vendor ID and product ID', () => {
    expect(
      isCardReader(
        fakeDevice({
          vendorId: OmniKeyCardReaderVendorId,
          productId: OmniKeyCardReaderProductId,
        })
      )
    ).toBe(true)
  })

  it('matches a device with the right product name and manufacturer (using spaces)', () => {
    expect(
      isCardReader(
        fakeDevice({
          deviceName: OmniKeyCardReaderDeviceName,
          manufacturer: OmniKeyCardReaderManufacturer,
        })
      )
    ).toBe(true)
  })

  it('matches a device with the right product name and manufacturer (using underscores)', () => {
    expect(
      isCardReader(
        fakeDevice({
          deviceName: OmniKeyCardReaderDeviceName.replace(/ /g, '_'),
          manufacturer: OmniKeyCardReaderManufacturer.replace(/ /g, '_'),
        })
      )
    ).toBe(true)
  })
})
