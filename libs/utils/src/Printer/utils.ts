import { Printer } from '../types'
import LocalPrinter from './LocalPrinter'

export function getPrinter(): Printer {
  return window.kiosk ?? new LocalPrinter()
}
