import { Printer } from '../types'

export default class NullPrinter implements Printer {
  async print(): Promise<void> {
    // do nothing
  }
}
