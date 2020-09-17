import { join } from 'path'
import election from './election'

export { election }
export const ballotPdf = join(__dirname, 'ballot.pdf')
export const filledInPage1 = join(__dirname, 'filled-in-dual-language-p1.png')
export const filledInPage2 = join(__dirname, 'filled-in-dual-language-p2.png')
export const filledInPage3 = join(__dirname, 'filled-in-dual-language-p3.png')
export const filledInPage4 = join(__dirname, 'filled-in-dual-language-p4.png')
export const filledInPage5 = join(__dirname, 'filled-in-dual-language-p5.png')
export const filledInPage5YesNoOvervotes = join(
  __dirname,
  'filled-in-dual-language-p5-yesno-overvotes.png'
)
