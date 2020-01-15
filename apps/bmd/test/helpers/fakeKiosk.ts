// Disable `import/no-unresolved` because this module only exists for TypeScript.
// eslint-disable-next-line import/no-unresolved
import { Kiosk } from 'kiosk-browser'

/**
 * Builds a `Kiosk` instance with mock methods.
 */
export default function fakeKiosk(): jest.Mocked<Kiosk> {
  return {
    print: jest.fn().mockResolvedValue(undefined),
    getBatteryInfo: jest
      .fn()
      .mockResolvedValue({ level: 1, discharging: false }),
  }
}
