export interface Printer {
  print(): Promise<void>
}

export class LocalPrinter implements Printer {
  public async print(): Promise<void> {
    window.print()
  }
}

export class NullPrinter implements Printer {
  public async print(): Promise<void> {
    // do nothing
  }
}

export default function getPrinter(): Printer {
  return new LocalPrinter()
}
