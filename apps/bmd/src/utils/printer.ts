// We only import pdfmake for its types, so we don't need pdfmake installed.
// eslint-disable-next-line import/no-unresolved
import * as pdfMake from 'pdfmake/build/pdfmake'
import fetchJSON from './fetchJSON'

interface StatusResponse {
  ok: boolean
}

interface NewJobResponse {
  id: string
}

export interface PrintJob {
  id: string
  owner: Printer
}

export enum PrintMethod {
  LocalOnly = 'LocalOnly',
  RemoteOnly = 'RemoteOnly',
  RemoteWithLocalFallback = 'RemoteWithLocalFallback',
}

export enum PrintStatus {
  Pending = 'Pending',
  Printing = 'Printing',
  Success = 'Success',
  Error = 'Error',
  Unknown = 'Unknown',
}

export enum PrintType {
  /**
   * Print the current page as-is.
   */
  CurrentPage = 'CurrentPage',

  /**
   * Print an HTML document.
   */
  HTMLDocument = 'HTMLDocument',

  /**
   * Print a fully-rendered PDF document.
   */
  PDFDocument = 'PDFDocument',

  /**
   * Print a PDF specified by a pdfmake document definition.
   */
  PDFMakeDocument = 'PDFMakeDocument',
}

export type PrintPayload =
  | {
      type: PrintType.CurrentPage
    }
  | {
      type: PrintType.HTMLDocument
      html: string
    }
  | {
      type: PrintType.PDFDocument
      pdf: Uint8Array
    }
  | {
      type: PrintType.PDFMakeDocument
      pdf: pdfMake.TDocumentDefinitions
    }

export interface Printer {
  canPrint(type: PrintType): Promise<boolean>
  print(payload: PrintPayload): Promise<PrintJob>
  getStatus(job: PrintJob): Promise<PrintStatus>
}

export class LocalPrinter implements Printer {
  public async canPrint(type: PrintType): Promise<boolean> {
    return type === PrintType.CurrentPage
  }

  public async print(payload: PrintPayload): Promise<PrintJob> {
    if (!(await this.canPrint(payload.type))) {
      throw new Error(
        `${this.constructor.name} cannot handle print payload with type: ${payload.type}`
      )
    }

    window.print()
    return { id: '__local', owner: this }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async getStatus(job: PrintJob): Promise<PrintStatus> {
    return PrintStatus.Unknown
  }
}

export class NullPrinter implements Printer {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async canPrint(type: PrintType): Promise<boolean> {
    return true
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async print(payload: PrintPayload): Promise<PrintJob> {
    return { id: '__nothing', owner: this }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async getStatus(job: PrintJob): Promise<PrintStatus> {
    return PrintStatus.Unknown
  }
}

export class RemotePrinter implements Printer {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async canPrint(type: PrintType): Promise<boolean> {
    try {
      const status = await fetchJSON<StatusResponse>('/printer/status')

      return status.ok
    } catch {
      return false
    }
  }

  public async print(payload: PrintPayload): Promise<PrintJob> {
    if (!(await this.canPrint(payload.type))) {
      throw new Error(
        `unable to print: remote printer is not ready or cannot print type: ${payload.type}`
      )
    }

    if (payload.type === PrintType.CurrentPage) {
      return await this.printCurrentPage()
    }

    if (payload.type === PrintType.HTMLDocument) {
      return await this.printHTMLDocument(payload.html)
    }

    if (payload.type === PrintType.PDFDocument) {
      return await this.printPDFDocument(payload.pdf)
    }

    // istanbul ignore else
    if (payload.type === PrintType.PDFMakeDocument) {
      return await this.printPDFMakeDocument(payload.pdf)
    }

    // istanbul ignore next
    throw new Error(`unknown payload type: ${(payload as PrintPayload).type}`)
  }

  private async printCurrentPage(): Promise<PrintJob> {
    return await this.printHTMLDocument(document.documentElement.outerHTML)
  }

  private async printHTMLDocument(html: string): Promise<PrintJob> {
    return await this.createPrintJob(html, 'text/html')
  }

  private async printPDFDocument(pdf: Uint8Array): Promise<PrintJob> {
    return await this.createPrintJob(pdf, 'application/pdf')
  }

  private async printPDFMakeDocument(
    pdf: pdfMake.TDocumentDefinitions
  ): Promise<PrintJob> {
    return await this.createPrintJob(
      JSON.stringify(pdf),
      'x-application/pdfmake'
    )
  }

  private async createPrintJob(
    body: RequestInit['body'],
    contentType: string
  ): Promise<PrintJob> {
    const newJob = await fetchJSON<NewJobResponse>('/printer/jobs/new', {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
      },
      body,
    })

    return { id: newJob.id, owner: this }
  }

  /**
   * @todo implement this when the server implements `/printer/jobs/{id}`
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async getStatus(_job: PrintJob): Promise<PrintStatus> {
    return PrintStatus.Unknown
  }
}

export class FallbackPrinters implements Printer {
  private readonly printers: Printer[]

  public constructor(printers: Printer[]) {
    if (printers.length === 0) {
      throw new Error('at least one printer is required')
    }

    this.printers = printers
  }

  public async canPrint(type: PrintType): Promise<boolean> {
    for (const printer of this.printers) {
      if (await printer.canPrint(type)) {
        return true
      }
    }

    return false
  }

  public async print(payload: PrintPayload): Promise<PrintJob> {
    for (const printer of this.printers) {
      if (await printer.canPrint(payload.type)) {
        return printer.print(payload)
      }
    }

    throw new Error('no printers were ready to print')
  }

  public async getStatus(job: PrintJob): Promise<PrintStatus> {
    for (const printer of this.printers) {
      if (printer === job.owner) {
        return printer.getStatus(job)
      }
    }

    throw new Error(`no printers own job: ${job.id}`)
  }
}

export default function makePrinter(method: PrintMethod): Printer {
  switch (method) {
    case PrintMethod.LocalOnly:
      return new LocalPrinter()

    case PrintMethod.RemoteOnly:
      return new RemotePrinter()

    case PrintMethod.RemoteWithLocalFallback:
      return new FallbackPrinters([new RemotePrinter(), new LocalPrinter()])

    default:
      throw new TypeError(`unknown print method: ${method}`)
  }
}
