import { join } from 'path'
import { Fixture } from '../../fixtures'

export const filledInPage1_01 = new Fixture(
  join(__dirname, 'filled-in-p1-01.png')
)
export const filledInPage1_02 = new Fixture(
  join(__dirname, 'filled-in-p1-02.png')
)
export const filledInPage1_03 = new Fixture(
  join(__dirname, 'filled-in-p1-03.png')
)
export const filledInPage1_04 = new Fixture(
  join(__dirname, 'filled-in-p1-04.png')
)
export const filledInPage1_05 = new Fixture(
  join(__dirname, 'filled-in-p1-05.png')
)
export const filledInPage2 = new Fixture(join(__dirname, 'filled-in-p2.png'))

export const district5BlankPage1 = new Fixture(join(__dirname, 'ballot-p1.png'))
export const eastWeirBlankPage1 = new Fixture(
  join(__dirname, 'ballot-east-weir-p1.png')
)
export const eastWeirBlankPage2 = new Fixture(
  join(__dirname, 'ballot-east-weir-p2.png')
)

export { default as election } from './election'
