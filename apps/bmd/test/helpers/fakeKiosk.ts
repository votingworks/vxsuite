// Disable `import/no-unresolved` because this module only exists for TypeScript.
// eslint-disable-next-line import/no-unresolved
import { Kiosk, BatteryInfo, PrinterInfo } from 'kiosk-browser'

/**
 * Builds a `Kiosk` instance with mock methods.
 */
export default function fakeKiosk({
  battery: { level = 1, discharging = false } = {},
  printers,
}: {
  battery?: Partial<BatteryInfo>
  printers?: Partial<PrinterInfo>[]
} = {}): jest.Mocked<Kiosk> {
  if (!printers) {
    printers = [{}]
  }

  printers = printers.map(printer => ({
    connected: true,
    description: 'Fake Printer',
    isDefault: true,
    name: 'Fake Printer',
    ...printer,
  }))

  return {
    print: jest.fn().mockResolvedValue(undefined),
    getBatteryInfo: jest.fn().mockResolvedValue({ level, discharging }),
    getPrinterInfo: jest.fn().mockResolvedValue(printers),
  }
}
