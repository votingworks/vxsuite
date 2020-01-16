import { mockOf } from '../../test/testUtils'
import getPrinter, { LocalPrinter, NullPrinter } from './printer'

const printMock = mockOf(window.print)

test('`getPrinter` makes a `LocalPrinter`', () => {
  expect(getPrinter()).toBeInstanceOf(LocalPrinter)
})

describe('a local printer', () => {
  it('calls `window.print` when printing', async () => {
    printMock.mockReturnValueOnce(undefined)
    await new LocalPrinter().print()
    expect(window.print).toHaveBeenCalled()
  })
})

describe('a null printer', () => {
  it('does not print to `window.print`', async () => {
    printMock.mockReturnValueOnce(undefined)
    await new NullPrinter().print()
    expect(window.print).not.toHaveBeenCalled()
  })
})
