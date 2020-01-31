import fetchMock from 'fetch-mock'
import fakeKiosk, {
  fakeDevice,
  fakePrinterInfo,
} from '../../test/helpers/fakeKiosk'
import { getHardware, KioskHardware, MemoryHardware } from './Hardware'

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

  it('gets card reader status by checking /card/reader', async () => {
    const kiosk = fakeKiosk()
    const hardware = new KioskHardware(kiosk)

    fetchMock.get('/card/reader', () => JSON.stringify({ connected: true }))
    expect(await hardware.readCardReaderStatus()).toEqual({ connected: true })
  })
})

describe('MemoryHardware', () => {
  it('has a standard config with all the typical hardware', () => {
    const hardware = MemoryHardware.standard
    expect(hardware.getDeviceList()).toHaveLength(
      1 + // accessible controller
      1 + // printer
        1 // card reader
    )
  })

  it('has no connected devices by default', () => {
    const hardware = new MemoryHardware()
    expect(hardware.getDeviceList()).toEqual([])
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

    hardware.onDeviceChange.add(callback)
    expect(callback).not.toHaveBeenCalled()

    hardware.addDevice(device)
    expect(callback).toHaveBeenCalledWith(0 /* ChangeType.Add */, device)
    expect(hardware.getDeviceList()).toEqual([device])
  })

  it('triggers callbacks when removing devices', () => {
    const hardware = new MemoryHardware()
    const callback = jest.fn()
    const device = fakeDevice()

    hardware.addDevice(device)

    hardware.onDeviceChange.add(callback)
    expect(callback).toHaveBeenNthCalledWith(1, 0 /* ChangeType.Add */, device)

    hardware.removeDevice(device)
    expect(callback).toHaveBeenNthCalledWith(
      2,
      1 /* ChangeType.Remove */,
      device
    )
    expect(hardware.getDeviceList()).toEqual([])
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
