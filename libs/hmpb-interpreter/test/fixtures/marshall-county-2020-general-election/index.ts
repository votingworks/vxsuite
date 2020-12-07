import { join } from 'path'
import { Fixture } from '../../fixtures'
import election from './election'

export { election }

export const blankPage1 = new Fixture(
  join(__dirname, 'ballot-mt-pleasant-p1.png')
)
export const blankPage2 = new Fixture(
  join(__dirname, 'ballot-mt-pleasant-p2.png')
)

/**
 * This image has a lot of toner gaps.
 */
export const filledInPage1 = new Fixture(join(__dirname, 'filledInPage1.png'))
