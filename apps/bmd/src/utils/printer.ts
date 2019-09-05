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

export interface Printer {
  isReady(): Promise<boolean>
  print(): Promise<PrintJob>
  getStatus(job: PrintJob): Promise<PrintStatus>
}

export class LocalPrinter implements Printer {
  public async isReady(): Promise<boolean> {
    return true
  }

  public async print(): Promise<PrintJob> {
    window.print()
    return { id: '__local', owner: this }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async getStatus(job: PrintJob): Promise<PrintStatus> {
    return PrintStatus.Unknown
  }
}

export class NullPrinter implements Printer {
  public async isReady(): Promise<boolean> {
    return true
  }

  public async print(): Promise<PrintJob> {
    return { id: '__nothing', owner: this }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async getStatus(job: PrintJob): Promise<PrintStatus> {
    return PrintStatus.Unknown
  }
}

export class RemotePrinter implements Printer {
  public async isReady(): Promise<boolean> {
    try {
      const status = await fetchJSON<StatusResponse>('/printer/status')

      return status.ok
    } catch {
      return false
    }
  }

  public async print(): Promise<PrintJob> {
    if (!(await this.isReady())) {
      throw new Error('unable to print: remote printer is not ready')
    }

    const newJob = await fetchJSON<NewJobResponse>('/printer/jobs/new', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/html',
      },
      body: document.documentElement.outerHTML,
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

  public async isReady(): Promise<boolean> {
    for (const printer of this.printers) {
      if (await printer.isReady()) {
        return true
      }
    }

    return false
  }

  public async print(): Promise<PrintJob> {
    for (const printer of this.printers) {
      if (await printer.isReady()) {
        return printer.print()
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
