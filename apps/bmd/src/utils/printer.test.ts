import fetchMock from 'fetch-mock'
import fakePrinter from '../../test/helpers/fakePrinter'
import { mockOf } from '../../test/testUtils'
import makePrinter, {
  FallbackPrinters,
  LocalPrinter,
  NullPrinter,
  PrintMethod,
  PrintStatus,
  PrintType,
  RemotePrinter,
} from './printer'

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
  it('can always print the current page', async () => {
    expect(
      await makePrinter(PrintMethod.LocalOnly).canPrint(PrintType.CurrentPage)
    ).toBe(true)
  })

  it('cannot print anything else', async () => {
    expect(
      await makePrinter(PrintMethod.LocalOnly).canPrint(PrintType.HTMLDocument)
    ).toBe(false)
  })

  it('fails when trying to print anything but the current page', async () => {
    expect(
      makePrinter(PrintMethod.LocalOnly).print({
        type: PrintType.HTMLDocument,
        html: '<strong>hello world</strong>',
      })
    ).rejects.toThrowError(
      'LocalPrinter cannot handle print payload with type: HTMLDocument'
    )
  })

  it('calls `window.print` when printing', async () => {
    printMock.mockReturnValueOnce(undefined)

    await makePrinter(PrintMethod.LocalOnly).print({
      type: PrintType.CurrentPage,
    })
    expect(window.print).toHaveBeenCalled()
  })

  it('cannot get status of print', async () => {
    printMock.mockReturnValueOnce(undefined)

    const printer = makePrinter(PrintMethod.LocalOnly)
    const job = await printer.print({ type: PrintType.CurrentPage })

    expect(await printer.getStatus(job)).toEqual(PrintStatus.Unknown)
  })
})

describe('a remote printer', () => {
  it('can print anything if it responds to a status check', async () => {
    fetchMock.get('/printer/status', { ok: true })
    expect(
      await makePrinter(PrintMethod.RemoteOnly).canPrint(PrintType.CurrentPage)
    ).toBe(true)
  })

  it('cannot print anything if it fails to respond', async () => {
    fetchMock.get('/printer/status', 504)
    expect(
      await makePrinter(PrintMethod.RemoteOnly).canPrint(PrintType.CurrentPage)
    ).toBe(false)
  })

  it('cannot print if it responds but with a bad status', async () => {
    fetchMock.get('/printer/status', { ok: false })
    expect(
      await makePrinter(PrintMethod.RemoteOnly).canPrint(PrintType.CurrentPage)
    ).toBe(false)
  })

  it('does not call `window.print` when printing the current page', async () => {
    fetchMock.get('/printer/status', { ok: true })
    fetchMock.post('/printer/jobs/new', {
      body: JSON.stringify({ id: 'job-id' }),
      status: 201,
    })

    await makePrinter(PrintMethod.RemoteOnly).print({
      type: PrintType.CurrentPage,
    })
    expect(window.print).not.toHaveBeenCalled()
  })

  it('prints HTML documents', async () => {
    fetchMock.get('/printer/status', { ok: true })
    fetchMock.post('/printer/jobs/new', {
      body: JSON.stringify({ id: 'job-id' }),
      status: 201,
    })

    const job = await makePrinter(PrintMethod.RemoteOnly).print({
      type: PrintType.HTMLDocument,
      html: '<strong>hello world</strong>',
    })
    expect(window.print).not.toHaveBeenCalled()
    expect(job.id).toEqual('job-id')
  })

  it('prints PDF documents', async () => {
    fetchMock.get('/printer/status', { ok: true })
    fetchMock.post('/printer/jobs/new', {
      body: JSON.stringify({ id: 'job-id' }),
      status: 201,
    })

    const job = await makePrinter(PrintMethod.RemoteOnly).print({
      type: PrintType.PDFDocument,
      pdf: Uint8Array.of(),
    })
    expect(window.print).not.toHaveBeenCalled()
    expect(job.id).toEqual('job-id')
  })

  it('prints pdfmake documents', async () => {
    fetchMock.get('/printer/status', { ok: true })
    fetchMock.post('/printer/jobs/new', {
      body: JSON.stringify({ id: 'job-id' }),
      status: 201,
    })

    const job = await makePrinter(PrintMethod.RemoteOnly).print({
      type: PrintType.PDFMakeDocument,
      pdf: { content: [] },
    })
    expect(window.print).not.toHaveBeenCalled()
    expect(job.id).toEqual('job-id')
  })

  it('refuses to print if it is not ready', async () => {
    fetchMock.get('/printer/status', { ok: false })

    expect(
      makePrinter(PrintMethod.RemoteOnly).print({ type: PrintType.CurrentPage })
    ).rejects.toThrowError('unable to print: remote printer is not ready')
  })

  it('cannot get status of print (https://github.com/votingworks/module-print/issues/6)', async () => {
    fetchMock.get('/printer/status', { ok: true })
    fetchMock.post('/printer/jobs/new', {
      body: JSON.stringify({ id: 'job-id' }),
      status: 201,
    })

    const printer = makePrinter(PrintMethod.RemoteOnly)
    const job = await printer.print({ type: PrintType.CurrentPage })

    expect(await printer.getStatus(job)).toEqual(PrintStatus.Unknown)
  })
})

describe('a fallback printer', () => {
  it('requires at least one printer', () => {
    expect(() => new FallbackPrinters([])).toThrow()
  })

  it('can print if any printer can print', async () => {
    const printer = new FallbackPrinters([
      fakePrinter({
        async canPrint(): Promise<boolean> {
          return true
        },
      }),
    ])

    expect(await printer.canPrint(PrintType.CurrentPage)).toBe(true)
  })

  it('cannot print if no printer can print', async () => {
    const printer = new FallbackPrinters([fakePrinter()])

    expect(await printer.canPrint(PrintType.CurrentPage)).toBe(false)
  })

  it('prints using the first printer that can print', async () => {
    const p1 = fakePrinter()
    const p2 = fakePrinter({
      async canPrint(): Promise<boolean> {
        return true
      },
    })
    const p3 = fakePrinter()
    const printer = new FallbackPrinters([p1, p2, p3])

    expect((await printer.print({ type: PrintType.CurrentPage })).owner).toBe(
      p2
    )
  })

  it('fails to print if no printers can print', async () => {
    const printer = new FallbackPrinters([fakePrinter()])

    expect(printer.print({ type: PrintType.CurrentPage })).rejects.toThrowError(
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
  it('can always print', async () => {
    expect(await new NullPrinter().canPrint(PrintType.CurrentPage)).toBe(true)
  })

  it('does not print to `window.print`', async () => {
    const printer = new NullPrinter()

    expect((await printer.print({ type: PrintType.CurrentPage })).owner).toBe(
      printer
    )
    expect(window.print).not.toHaveBeenCalled()
  })

  it('cannot get status', async () => {
    const printer = new NullPrinter()

    expect(await printer.getStatus({ id: '__whatever', owner: printer })).toBe(
      PrintStatus.Unknown
    )
  })
})
