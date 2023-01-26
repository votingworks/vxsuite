import { safeParseElectionDefinition } from '@votingworks/types';
import * as electionPrimarySample from './electionPrimarySample.json';
import * as electionSample from './electionSample.json';
import * as electionSampleNoSeal from './electionSampleNoSeal.json';
import * as electionSampleWithSeal from './electionSampleWithSeal.json';
import * as electionSampleWithSealAndReportingUrl from './electionSampleWithSealAndReportingUrl.json';

/**
 * Election definition from `./electionPrimarySample.json`.
 */
export const electionPrimarySampleDefinition = safeParseElectionDefinition(
  electionPrimarySample.asText()
).unsafeUnwrap();

/**
 * Election definition from `./electionSample.json`.
 */
export const electionSampleDefinition = safeParseElectionDefinition(
  electionSample.asText()
).unsafeUnwrap();

/**
 * Election definition from `./electionSampleNoSeal.json`.
 */
export const electionSampleNoSealDefinition = safeParseElectionDefinition(
  electionSampleNoSeal.asText()
).unsafeUnwrap();

/**
 * Election definition from `./electionSampleWithSeal.json`.
 */
export const electionSampleWithSealDefinition = safeParseElectionDefinition(
  electionSampleWithSeal.asText()
).unsafeUnwrap();

/**
 * Election definition from `./electionSampleWithSealAndReportingUrl.json`.
 */
export const electionSampleWithSealAndReportingUrlDefinition =
  safeParseElectionDefinition(
    electionSampleWithSealAndReportingUrl.asText()
  ).unsafeUnwrap();
