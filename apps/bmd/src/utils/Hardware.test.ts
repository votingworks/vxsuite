import fakeKiosk from '../../test/helpers/fakeKiosk'
import { getHardware } from './Hardware'

describe('KioskHardware', () => {
  it('reads battery status from kiosk', async () => {
    try {
      window.kiosk = fakeKiosk()
      const hardware = getHardware()
      await hardware.readBatteryStatus()
      expect(window.kiosk.getBatteryInfo).toHaveBeenCalledTimes(1)
    } finally {
      window.kiosk = undefined
    }
  })
})
