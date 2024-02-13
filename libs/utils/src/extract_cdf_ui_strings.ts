// TODO(kofi): Remove once extractors are implemented.

import setWith from 'lodash.setwith';

import {
  BallotDefinition,
  ElectionStringKey,
  LanguageCode,
  UiStringsPackage,
  getElectionDistricts,
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
    setWith(uiStrings, valuePath, value.Content, Object);
  }
}

/**
 * Sets the default English language string for the given ballot content text.
 * Used for content that will be spoken, but not translated, like ballot style.
 */
function setStaticUiString(params: {
  uiStrings: UiStringsPackage;
  stringKey: StringKey;
  value: string;
}) {
  const { stringKey, uiStrings, value } = params;

  const valuePath = [LanguageCode.ENGLISH, stringKey].flat();
  setWith(uiStrings, valuePath, value, Object);
}

const extractorFns: Record<
  ElectionStringKey,
  (
    cdfElection: BallotDefinition.BallotDefinition,
    uiStrings: UiStringsPackage
  ) => void
> = {
  [ElectionStringKey.BALLOT_LANGUAGE]() {
    // No-Op: This election string is not available via CDF.
    // It is currently extracted directly from the
    // `@votingworks/types/ElectionPackageFileName.VX_ELECTION_STRINGS` file.
  },
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

  [ElectionStringKey.CANDIDATE_NAME](cdfElection, uiStrings) {
    const candidates = assertDefined(cdfElection.Election[0]).Candidate || [];
    for (const candidate of candidates) {
      setInternationalizedUiStrings({
        stringKey: [ElectionStringKey.CANDIDATE_NAME, candidate['@id']],
        uiStrings,
        values: candidate.BallotName.Text,
      });
    }
  },

  [ElectionStringKey.CONTEST_DESCRIPTION](cdfElection, uiStrings) {
    for (const contest of assertDefined(cdfElection.Election[0]).Contest) {
      if (contest['@type'] !== 'BallotDefinition.BallotMeasureContest') {
        continue;
      }

      setInternationalizedUiStrings({
        stringKey: [ElectionStringKey.CONTEST_DESCRIPTION, contest['@id']],
        uiStrings,
        values: contest.FullText.Text,
      });
    }
  },

  [ElectionStringKey.CONTEST_OPTION_LABEL](cdfElection, uiStrings) {
    for (const contest of assertDefined(cdfElection.Election[0]).Contest) {
      if (contest['@type'] !== 'BallotDefinition.BallotMeasureContest') {
        continue;
      }

      for (const option of contest.ContestOption) {
        setInternationalizedUiStrings({
          stringKey: [ElectionStringKey.CONTEST_OPTION_LABEL, option['@id']],
          uiStrings,
          values: option.Selection.Text,
        });
      }
    }
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

  [ElectionStringKey.COUNTY_NAME](cdfElection, uiStrings) {
    const county = cdfElection.GpUnit.find(
      (gpUnit) => gpUnit.Type === BallotDefinition.ReportingUnitType.County
    );

    if (!county) {
      return;
    }

    setInternationalizedUiStrings({
      stringKey: ElectionStringKey.COUNTY_NAME,
      uiStrings,
      values: county.Name.Text,
    });
  },

  [ElectionStringKey.DISTRICT_NAME](cdfElection, uiStrings) {
    const districts = getElectionDistricts(cdfElection);

    for (const district of districts) {
      setInternationalizedUiStrings({
        stringKey: [ElectionStringKey.DISTRICT_NAME, district['@id']],
        uiStrings,
        values: district.Name.Text,
      });
    }
  },

  [ElectionStringKey.ELECTION_DATE]() {
    // No-Op: This election string is not available via CDF.
    // It is currently extracted directly from the
    // `@votingworks/types/ElectionPackageFileName.VX_ELECTION_STRINGS` file.
  },

  [ElectionStringKey.ELECTION_TITLE](cdfElection, uiStrings) {
    setInternationalizedUiStrings({
      stringKey: ElectionStringKey.ELECTION_TITLE,
      uiStrings,
      values: assertDefined(cdfElection.Election[0]).Name.Text,
    });
  },

  [ElectionStringKey.PARTY_FULL_NAME](cdfElection, uiStrings) {
    for (const party of cdfElection.Party) {
      setInternationalizedUiStrings({
        stringKey: [ElectionStringKey.PARTY_FULL_NAME, party['@id']],
        uiStrings,
        values: party.Name.Text,
      });
    }
  },

  [ElectionStringKey.PARTY_NAME](cdfElection, uiStrings) {
    for (const party of cdfElection.Party) {
      setInternationalizedUiStrings({
        stringKey: [ElectionStringKey.PARTY_NAME, party['@id']],
        uiStrings,
        values: party.vxBallotLabel.Text,
      });
    }
  },

  [ElectionStringKey.PRECINCT_NAME](cdfElection, uiStrings) {
    for (const gpUnit of cdfElection.GpUnit) {
      if (gpUnit.Type !== BallotDefinition.ReportingUnitType.Precinct) {
        continue;
      }

      setInternationalizedUiStrings({
        stringKey: [ElectionStringKey.PRECINCT_NAME, gpUnit['@id']],
        uiStrings,
        values: gpUnit.Name.Text,
      });
    }
  },

  [ElectionStringKey.STATE_NAME](cdfElection, uiStrings) {
    const state = cdfElection.GpUnit.find(
      (gpUnit) => gpUnit.Type === BallotDefinition.ReportingUnitType.State
    );

    if (!state) {
      return;
    }

    setInternationalizedUiStrings({
      stringKey: ElectionStringKey.STATE_NAME,
      uiStrings,
      values: state.Name.Text,
    });
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
