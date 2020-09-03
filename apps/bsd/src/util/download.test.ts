import fetchMock from 'fetch-mock'
import fakeKiosk from '../../test/helpers/fakeKiosk'
import download from './download'

let oldLocation: typeof window.location

beforeEach(() => {
  oldLocation = window.location
  Object.defineProperty(window, 'location', {
    writable: true,
    configurable: true,
    value: {
      ...oldLocation,
      assign: jest.fn(),
    },
  })
})

afterEach(() => {
  window.location = oldLocation
  delete window.kiosk
})

test('outside kiosk browser', async () => {
  expect(window.kiosk).toBeUndefined()
  jest.spyOn(window.location, 'assign').mockReturnValue()
  await download('/a/url')
  expect(window.location.assign).toHaveBeenCalledWith('/a/url')
})

// TODO: enable this once fetch-mock and jsdom support the streaming fetch APIs
test.skip('kiosk browser successful download', async () => {
  const kiosk = fakeKiosk()
  window.kiosk = kiosk

  const write = jest.fn()
  const end = jest.fn()
  kiosk.saveAs.mockResolvedValueOnce({ write, end })

  fetchMock.getOnce('/a/url', 'abcdefg')
  await download('/a/url')
  expect(write).toHaveBeenCalledWith('abcdefg')
  expect(end).toHaveBeenCalled()
})
