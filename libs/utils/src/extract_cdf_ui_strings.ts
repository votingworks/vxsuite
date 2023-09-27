// TODO(kofi): Remove once extractors are implemented.
/* eslint-disable @typescript-eslint/no-unused-vars */

import _ from 'lodash';

import {
  BallotDefinition,
  ElectionStringKey,
  LanguageCode,
  UiStringsPackage,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';

const SUPPORTED_LANGUAGES = new Set<string>(Object.values(LanguageCode));

/**
 * String translation string key, with support for one level of optional nesting
 * for strings of the same type that vary based on content ID(e.g.
 * `['contestTitle', contest.id]`).
 *
 * See https://www.i18next.com/translation-function/essentials#accessing-keys
 */
type StringKey = ElectionStringKey | [ElectionStringKey, string];

/**
 * Sets the appropriate language strings in supported languages for the given
 * internationalized CDF ballot content text.
 */
function setInternationalizedUiStrings(params: {
  uiStrings: UiStringsPackage;
  stringKey: StringKey;
  values: readonly BallotDefinition.LanguageString[];
}) {
  const { stringKey, uiStrings, values } = params;

  for (const value of values) {
    const languageCode = value.Language;
    if (!SUPPORTED_LANGUAGES.has(languageCode)) {
      continue;
    }

    const valuePath = [languageCode, stringKey].flat();
    _.set(uiStrings, valuePath, value.Content);
  }
}

/**
 * Sets the default English language string for the given ballot content text.
 * Used for content that will be spoken, but not translated, like ballot
 */
function setStaticUiString(params: {
  uiStrings: UiStringsPackage;
  stringKey: StringKey;
  value: string;
}) {
  const { stringKey, uiStrings, value } = params;

  const valuePath = [LanguageCode.ENGLISH, stringKey].flat();
  _.set(uiStrings, valuePath, value);
}

const extractorFns: Record<
  ElectionStringKey,
  (
    cdfElection: BallotDefinition.BallotDefinition,
    uiStrings: UiStringsPackage
  ) => void
> = {
  [ElectionStringKey.BALLOT_STYLE_ID](cdfElection, uiStrings) {
    for (const ballotStyle of assertDefined(cdfElection.Election[0])
      .BallotStyle) {
      const ballotStyleId = assertDefined(
        ballotStyle.ExternalIdentifier[0]
      ).Value;

      setStaticUiString({
        stringKey: [ElectionStringKey.BALLOT_STYLE_ID, ballotStyleId],
        uiStrings,
        // TODO(kofi): Should we start populating the `Label` field to provide
        // more user-friendly display values?
        value: assertDefined(ballotStyle.ExternalIdentifier[0]).Value,
      });
    }
  },

  [ElectionStringKey.CANDIDATE_NAME](_cdfElection, _uiStrings) {
    // TODO(kofi): Implement
  },

  [ElectionStringKey.CONTEST_DESCRIPTION](_cdfElection, _uiStrings) {
    // TODO(kofi): Implement
  },

  [ElectionStringKey.CONTEST_OPTION_LABEL](_cdfElection, _uiStrings) {
    // TODO(kofi): Implement
  },

  [ElectionStringKey.CONTEST_TITLE](cdfElection, uiStrings) {
    for (const contest of assertDefined(cdfElection.Election[0]).Contest) {
      setInternationalizedUiStrings({
        stringKey: [ElectionStringKey.CONTEST_TITLE, contest['@id']],
        uiStrings,
        values: contest.BallotTitle.Text,
      });
    }
  },

  [ElectionStringKey.COUNTY_NAME](_cdfElection, _uiStrings) {
    // TODO(kofi): Implement
  },

  [ElectionStringKey.DISTRICT_NAME](_cdfElection, _uiStrings) {
    // TODO(kofi): Implement
  },

  [ElectionStringKey.ELECTION_TITLE](cdfElection, uiStrings) {
    setInternationalizedUiStrings({
      stringKey: ElectionStringKey.ELECTION_TITLE,
      uiStrings,
      values: assertDefined(cdfElection.Election[0]).Name.Text,
    });
  },

  [ElectionStringKey.PARTY_NAME](_cdfElection, _uiStrings) {
    // TODO(kofi): Implement
  },

  [ElectionStringKey.PRECINCT_NAME](_cdfElection, _uiStrings) {
    // TODO(kofi): Implement
  },

  [ElectionStringKey.STATE_NAME](_cdfElection, _uiStrings) {
    // TODO(kofi): Implement
  },
};

export function extractCdfUiStrings(
  cdfElection: BallotDefinition.BallotDefinition
): UiStringsPackage {
  const uiStrings: UiStringsPackage = {};

  for (const extractorFn of Object.values(extractorFns)) {
    extractorFn(cdfElection, uiStrings);
  }

  return uiStrings;
}
