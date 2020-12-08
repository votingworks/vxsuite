import { join } from 'path'
import { Fixture } from '../../fixtures'
import election from './election'

export { election }

export const mtPleasantBlankPage1 = new Fixture(
  join(__dirname, 'ballot-mt-pleasant-p1.png')
)
export const mtPleasantBlankPage2 = new Fixture(
  join(__dirname, 'ballot-mt-pleasant-p2.png')
)

export const redBanksBlankPage1 = new Fixture(
  join(__dirname, 'ballot-red-banks-p1.png')
)
export const redBanksBlankPage2 = new Fixture(
  join(__dirname, 'ballot-red-banks-p2.png')
)

/**
 * This image has a lot of toner gaps.
 */
export const mtPleasantFilledInPage1 = new Fixture(
  join(__dirname, 'filledInPage1.png')
)

/**
 * This image is pretty skewed.
 */
export const redBanksFilledInPage2 = new Fixture(
  join(__dirname, 'filledInPage2.png')
)
