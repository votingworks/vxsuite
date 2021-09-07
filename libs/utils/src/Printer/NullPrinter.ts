import { Printer } from '../types'

export default class NullPrinter implements Printer {
  public async print(): Promise<void> {
    // do nothing
  }
}
