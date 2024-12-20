import { assert, assertDefined } from '@votingworks/basics';
import {
  CandidateContest,
  Election,
  ElectionStringKey,
  UiStringsPackage,
  YesNoContest,
  BallotLanguageConfigs,
  getAllBallotLanguages,
  LanguageCode,
} from '@votingworks/types';

import { format } from '@votingworks/utils';
import { GoogleCloudTranslator } from './translator';
import { setUiString } from './utils';

interface ElectionString {
  stringKey: ElectionStringKey | [ElectionStringKey, string];
  stringInEnglish: string;
}

interface ElectionStringConfigNotTranslatable {
  translatable: false;
}

interface ElectionStringConfigTranslatable {
  translatable: true;
  customTranslationMethod?: (input: {
    election: Election;
    languageCode: LanguageCode;
    stringInEnglish: string;
  }) => string;
}

type ElectionStringConfig =
  | ElectionStringConfigNotTranslatable
  | ElectionStringConfigTranslatable;

const electionStringConfigs: Record<ElectionStringKey, ElectionStringConfig> = {
  [ElectionStringKey.BALLOT_LANGUAGE]: {
    translatable: true,
    customTranslationMethod: (p) =>
      format.languageDisplayName({
        languageCode: p.languageCode,
      }),
  },
  [ElectionStringKey.BALLOT_STYLE_ID]: {
    translatable: false,
  },
  [ElectionStringKey.CANDIDATE_NAME]: {
    translatable: false,
  },
  [ElectionStringKey.CONTEST_DESCRIPTION]: {
    translatable: true,
  },
  [ElectionStringKey.CONTEST_OPTION_LABEL]: {
    translatable: true,
  },
  [ElectionStringKey.CONTEST_TERM]: {
    translatable: true,
  },
  [ElectionStringKey.CONTEST_TITLE]: {
    translatable: true,
  },
  [ElectionStringKey.COUNTY_NAME]: {
    translatable: true,
  },
  [ElectionStringKey.DISTRICT_NAME]: {
    translatable: true,
  },
  [ElectionStringKey.ELECTION_DATE]: {
    translatable: true,
    customTranslationMethod: ({ election, languageCode }) =>
      format.localeLongDate(
        election.date.toMidnightDatetimeWithSystemTimezone(),
        languageCode
      ),
  },
  [ElectionStringKey.ELECTION_TITLE]: {
    translatable: true,
  },
  [ElectionStringKey.PARTY_FULL_NAME]: {
    translatable: true,
  },
  [ElectionStringKey.PARTY_NAME]: {
    translatable: true,
  },
  [ElectionStringKey.PRECINCT_NAME]: {
    translatable: true,
  },
  [ElectionStringKey.STATE_NAME]: {
    translatable: true,
  },
};

const electionStringExtractorFns: Record<
  ElectionStringKey,
  (election: Election) => ElectionString[]
> = {
  [ElectionStringKey.BALLOT_LANGUAGE]() {
    return [
      {
        stringKey: ElectionStringKey.BALLOT_LANGUAGE,
        stringInEnglish: 'English',
      },
    ];
  },
  [ElectionStringKey.BALLOT_STYLE_ID](election) {
    return election.ballotStyles.map((ballotStyle) => ({
      stringKey: [ElectionStringKey.BALLOT_STYLE_ID, ballotStyle.id],
      stringInEnglish: ballotStyle.groupId,
    }));
  },
  [ElectionStringKey.CANDIDATE_NAME](election) {
    return election.contests
      .filter(
        (contest): contest is CandidateContest => contest.type === 'candidate'
      )
      .flatMap((contest) =>
        contest.candidates.map(
          (candidate): ElectionString => ({
            stringKey: [ElectionStringKey.CANDIDATE_NAME, candidate.id],
            stringInEnglish: candidate.name,
          })
        )
      );
  },
  [ElectionStringKey.CONTEST_DESCRIPTION](election) {
    return election.contests
      .filter((contest): contest is YesNoContest => contest.type === 'yesno')
      .map((contest) => ({
        stringKey: [ElectionStringKey.CONTEST_DESCRIPTION, contest.id],
        stringInEnglish: contest.description,
      }));
  },
  [ElectionStringKey.CONTEST_OPTION_LABEL](election) {
    return election.contests
      .filter((contest): contest is YesNoContest => contest.type === 'yesno')
      .flatMap((contest): ElectionString[] => [
        {
          stringKey: [
            ElectionStringKey.CONTEST_OPTION_LABEL,
            contest.yesOption.id,
          ],
          stringInEnglish: contest.yesOption.label,
        },
        {
          stringKey: [
            ElectionStringKey.CONTEST_OPTION_LABEL,
            contest.noOption.id,
          ],
          stringInEnglish: contest.noOption.label,
        },
      ]);
  },
  [ElectionStringKey.CONTEST_TERM](election) {
    return election.contests
      .filter(
        (contest): contest is CandidateContest => contest.type === 'candidate'
      )
      .filter((contest) => contest.termDescription)
      .map((contest) => ({
        stringKey: [ElectionStringKey.CONTEST_TERM, contest.id],
        stringInEnglish: assertDefined(contest.termDescription),
      }));
  },
  [ElectionStringKey.CONTEST_TITLE](election) {
    return election.contests.map((contest) => ({
      stringKey: [ElectionStringKey.CONTEST_TITLE, contest.id],
      stringInEnglish: contest.title,
    }));
  },
  [ElectionStringKey.COUNTY_NAME](election) {
    return [
      {
        stringKey: ElectionStringKey.COUNTY_NAME,
        stringInEnglish: election.county.name,
      },
    ];
  },
  [ElectionStringKey.DISTRICT_NAME](election) {
    return election.districts.map((district) => ({
      stringKey: [ElectionStringKey.DISTRICT_NAME, district.id],
      stringInEnglish: district.name,
    }));
  },
  [ElectionStringKey.ELECTION_DATE](election) {
    return [
      {
        stringKey: ElectionStringKey.ELECTION_DATE,
        stringInEnglish: format.localeLongDate(
          election.date.toMidnightDatetimeWithSystemTimezone(),
          LanguageCode.ENGLISH
        ),
      },
    ];
  },
  [ElectionStringKey.ELECTION_TITLE](election) {
    return [
      {
        stringKey: ElectionStringKey.ELECTION_TITLE,
        stringInEnglish: election.title,
      },
    ];
  },
  [ElectionStringKey.PARTY_FULL_NAME](election) {
    return election.parties.map((party) => ({
      stringKey: [ElectionStringKey.PARTY_FULL_NAME, party.id],
      stringInEnglish: party.fullName,
    }));
  },
  [ElectionStringKey.PARTY_NAME](election) {
    return election.parties.map((party) => ({
      stringKey: [ElectionStringKey.PARTY_NAME, party.id],
      stringInEnglish: party.name,
    }));
  },
  [ElectionStringKey.PRECINCT_NAME](election) {
    return election.precincts.map((precinct) => ({
      stringKey: [ElectionStringKey.PRECINCT_NAME, precinct.id],
      stringInEnglish: precinct.name,
    }));
  },
  [ElectionStringKey.STATE_NAME](election) {
    return [
      {
        stringKey: ElectionStringKey.STATE_NAME,
        stringInEnglish: election.state,
      },
    ];
  },
};

function getElectionStringConfig({
  stringKey,
}: ElectionString): ElectionStringConfig {
  return typeof stringKey === 'string'
    ? electionStringConfigs[stringKey]
    : electionStringConfigs[stringKey[0]];
}

function extractElectionStrings(election: Election): ElectionString[] {
  return Object.values(electionStringExtractorFns).flatMap((extractorFn) =>
    extractorFn(election)
  );
}

/**
 * Finds all election strings that need translation for the given election and set of ballot language configs and returns
 * the translated results.
 */
export async function extractAndTranslateElectionStrings(
  translator: GoogleCloudTranslator,
  election: Election,
  ballotLanguageConfigs: BallotLanguageConfigs
): Promise<UiStringsPackage> {
  const languages = getAllBallotLanguages(ballotLanguageConfigs);
  const untranslatedElectionStrings = extractElectionStrings(election);
  const electionStringsNotToTranslate = untranslatedElectionStrings.filter(
    (electionString) => {
      const config = getElectionStringConfig(electionString);
      return !config.translatable;
    }
  );
  const electionStringsToCloudTranslate = untranslatedElectionStrings.filter(
    (electionString) => {
      const config = getElectionStringConfig(electionString);
      return config.translatable && !config.customTranslationMethod;
    }
  );
  const electionStringsToCustomTranslate = untranslatedElectionStrings.filter(
    (electionString) => {
      const config = getElectionStringConfig(electionString);
      return config.translatable && config.customTranslationMethod;
    }
  );

  const electionStrings: UiStringsPackage = {};

  // Election strings not to translate
  for (const electionString of electionStringsNotToTranslate) {
    setUiString(
      electionStrings,
      LanguageCode.ENGLISH,
      electionString.stringKey,
      electionString.stringInEnglish
    );
  }

  // Election strings to cloud translate
  const stringsInEnglish = electionStringsToCloudTranslate.map(
    ({ stringInEnglish }) => stringInEnglish
  );
  for (const languageCode of languages) {
    const stringsInLanguage =
      languageCode === LanguageCode.ENGLISH
        ? stringsInEnglish
        : await translator.translateText(stringsInEnglish, languageCode);
    for (const [
      i,
      electionString,
    ] of electionStringsToCloudTranslate.entries()) {
      const { stringKey } = electionString;
      const stringInLanguage = stringsInLanguage[i];
      const config = getElectionStringConfig(electionString);
      assert(config.translatable);
      setUiString(
        electionStrings,
        languageCode,
        stringKey,
        assertDefined(stringInLanguage)
      );
    }
  }

  // Election strings to custom translate
  for (const electionString of electionStringsToCustomTranslate) {
    const { stringKey, stringInEnglish } = electionString;
    const config = getElectionStringConfig(electionString);
    assert(config.translatable && config.customTranslationMethod);
    for (const languageCode of languages) {
      const stringInLanguage = config.customTranslationMethod({
        election,
        languageCode,
        stringInEnglish,
      });
      setUiString(electionStrings, languageCode, stringKey, stringInLanguage);
    }
  }

  return electionStrings;
}
