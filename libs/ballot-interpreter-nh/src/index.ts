/* istanbul ignore file - this file only exists as the library entry-point–it shouldn't have any code to test */

export {
  convertElectionDefinition,
  ConvertIssueKind,
  type ConvertIssue,
} from './convert';
export * as templates from './data/templates';
export {
  getScannedBallotCardGeometry,
  getTemplateBallotCardGeometry,
} from './accuvote';
export { interpret } from './interpret';
export * from './layout';
