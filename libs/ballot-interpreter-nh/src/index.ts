/* istanbul ignore file - this file only exists as the library entry-point–it shouldn't have any code to test */

export {
  convertElectionDefinition,
  ConvertIssueKind,
  type ConvertIssue,
} from './convert';
export * as templates from './data/templates';
export { interpret } from './interpret';
export { OpenCvInterpreter } from './interpret/opencv/opencv_interpreter';
export * from './layout';
