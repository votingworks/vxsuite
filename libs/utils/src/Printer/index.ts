import LocalPrinter from './LocalPrinter'
import NullPrinter from './NullPrinter'
import { Printer } from '../types'

export { LocalPrinter, NullPrinter }

export function getPrinter(): Printer {
  return window.kiosk ?? new LocalPrinter()
}
