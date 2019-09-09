import fetchMock from 'fetch-mock'
import makePrinter, {
  PrintMethod,
  LocalPrinter,
  RemotePrinter,
  FallbackPrinters,
  PrintStatus,
  NullPrinter,
} from './printer'
import fakePrinter from '../../test/helpers/fakePrinter'
import { mockOf } from '../../test/testUtils'

const printMock = mockOf(window.print)

test('`makePrinter` can make a `LocalPrinter`', () => {
  expect(makePrinter(PrintMethod.LocalOnly)).toBeInstanceOf(LocalPrinter)
})

test('`makePrinter` can make a `RemotePrinter`', () => {
  expect(makePrinter(PrintMethod.RemoteOnly)).toBeInstanceOf(RemotePrinter)
})

test('`makePrinter` can make a remote printer that falls back to local', () => {
  expect(makePrinter(PrintMethod.RemoteWithLocalFallback)).toBeInstanceOf(
    FallbackPrinters
  )
})

test('`makePrinter` throws when given an unknown method', () => {
  expect(() => makePrinter('Cloud' as PrintMethod)).toThrow(
    'unknown print method: Cloud'
  )
})

describe('a local printer', () => {
  it('is always ready', async () => {
    expect(await makePrinter(PrintMethod.LocalOnly).isReady()).toBe(true)
  })

  it('calls `window.print` when printing', async () => {
    printMock.mockReturnValueOnce(undefined)

    await makePrinter(PrintMethod.LocalOnly).print()
    expect(window.print).toHaveBeenCalled()
  })

  it('cannot get status of print', async () => {
    printMock.mockReturnValueOnce(undefined)

    const printer = makePrinter(PrintMethod.LocalOnly)
    const job = await printer.print()

    expect(await printer.getStatus(job)).toEqual(PrintStatus.Unknown)
  })
})

describe('a remote printer', () => {
  it('is ready if it responds to a status check', async () => {
    fetchMock.get('/printer/status', { ok: true })
    expect(await makePrinter(PrintMethod.RemoteOnly).isReady()).toBe(true)
  })

  it('is not ready if it fails to respond', async () => {
    fetchMock.get('/printer/status', 504)
    expect(await makePrinter(PrintMethod.RemoteOnly).isReady()).toBe(false)
  })

  it('is not ready if it responds but with a bad status', async () => {
    fetchMock.get('/printer/status', { ok: false })
    expect(await makePrinter(PrintMethod.RemoteOnly).isReady()).toBe(false)
  })

  it('does not call `window.print` when printing', async () => {
    fetchMock.get('/printer/status', { ok: true })
    fetchMock.post(
      '/printer/jobs/new',
      new Response(JSON.stringify({ id: 'job-id' }), { status: 201 })
    )

    await makePrinter(PrintMethod.RemoteOnly).print()
    expect(window.print).not.toHaveBeenCalled()
  })

  it('refuses to print if it is not ready', async () => {
    fetchMock.get('/printer/status', { ok: false })

    expect(makePrinter(PrintMethod.RemoteOnly).print()).rejects.toThrowError(
      'unable to print: remote printer is not ready'
    )
  })

  it('cannot get status of print (https://github.com/votingworks/module-print/issues/6)', async () => {
    fetchMock.get('/printer/status', { ok: true })
    fetchMock.post(
      '/printer/jobs/new',
      new Response(JSON.stringify({ id: 'job-id' }), { status: 201 })
    )

    const printer = makePrinter(PrintMethod.RemoteOnly)
    const job = await printer.print()

    expect(await printer.getStatus(job)).toEqual(PrintStatus.Unknown)
  })
})

describe('a fallback printer', () => {
  it('requires at least one printer', () => {
    expect(() => new FallbackPrinters([])).toThrow()
  })

  it('`isReady` returns true if any printer is ready', async () => {
    const printer = new FallbackPrinters([
      fakePrinter({
        async isReady() {
          return true
        },
      }),
    ])

    expect(await printer.isReady()).toBe(true)
  })

  it('`isReady` returns false if no printer is ready', async () => {
    const printer = new FallbackPrinters([fakePrinter()])

    expect(await printer.isReady()).toBe(false)
  })

  it('`print` prints from the first printer that is ready', async () => {
    const p1 = fakePrinter()
    const p2 = fakePrinter({
      async isReady() {
        return true
      },
    })
    const p3 = fakePrinter()
    const printer = new FallbackPrinters([p1, p2, p3])

    expect((await printer.print()).owner).toBe(p2)
  })

  it('`print` fails if no printers are ready to print', async () => {
    const printer = new FallbackPrinters([fakePrinter()])

    expect(printer.print()).rejects.toThrowError(
      'no printers were ready to print'
    )
  })

  it('`getStatus` passes through to the owner of the job', async () => {
    const p1 = fakePrinter()
    const p2 = fakePrinter()
    const p3 = fakePrinter()
    const printer = new FallbackPrinters([p1, p2, p3])

    await printer.getStatus({ id: '__test', owner: p2 })

    expect(p2.getStatus).toHaveBeenCalledWith({ id: '__test', owner: p2 })
  })

  it('`getStatus` fails if no fallback printer is the job owner', async () => {
    const printer = new FallbackPrinters([fakePrinter()])

    expect(
      printer.getStatus({ id: '__test', owner: fakePrinter() })
    ).rejects.toThrowError('no printers own job: __test')
  })
})

describe('a null printer', () => {
  it('is always ready', async () => {
    expect(await new NullPrinter().isReady()).toBe(true)
  })

  it('does not print to `window.print`', async () => {
    const printer = new NullPrinter()

    expect((await printer.print()).owner).toBe(printer)
    expect(window.print).not.toHaveBeenCalled()
  })

  it('cannot get status', async () => {
    const printer = new NullPrinter()

    expect(await printer.getStatus({ id: '__whatever', owner: printer })).toBe(
      PrintStatus.Unknown
    )
  })
})
