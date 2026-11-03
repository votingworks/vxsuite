import { throwIllegalValue } from '@votingworks/basics';
import { convertHtmlToAudioCues } from '@votingworks/backend';
import {
  type Election,
  ElectionStringKey,
  hasSplits,
  LanguageCode,
} from '@votingworks/types';

export type DataUrl = string;

export interface TtsStringDefault {
  key: ElectionStringKey;
  subkey?: string;
  text: string;
}

export function ttsStringDefaultsForElection(
  election: Election
): TtsStringDefault[] {
  const strings: TtsStringDefault[] = [];

  if (election.title) {
    strings.push({
      key: ElectionStringKey.ELECTION_TITLE,
      text: election.title,
    });
  }

  if (election.state) {
    strings.push({
      key: ElectionStringKey.STATE_NAME,
      text: election.state,
    });
  }

  if (election.jurisdiction.name) {
    strings.push({
      key: ElectionStringKey.JURISDICTION_NAME,
      text: election.jurisdiction.name,
    });
  }

  for (const district of election.districts) {
    strings.push({
      key: ElectionStringKey.DISTRICT_NAME,
      subkey: district.id,
      text: district.name,
    });
  }

  for (const place of election.pollingPlaces || []) {
    strings.push({
      key: ElectionStringKey.POLLING_PLACE_NAME,
      subkey: place.id,
      text: place.name,
    });
  }

  for (const precinct of election.precincts) {
    strings.push({
      key: ElectionStringKey.PRECINCT_NAME,
      subkey: precinct.id,
      text: precinct.name,
    });

    if (!hasSplits(precinct)) continue;

    for (const split of precinct.splits) {
      strings.push({
        key: ElectionStringKey.PRECINCT_SPLIT_NAME,
        subkey: split.id,
        text: split.name,
      });
    }
  }

  for (const party of election.parties) {
    strings.push(
      {
        key: ElectionStringKey.PARTY_NAME,
        subkey: party.id,
        text: party.name,
      },
      {
        key: ElectionStringKey.PARTY_FULL_NAME,
        subkey: party.id,
        text: party.fullName,
      }
    );
  }

  for (const contest of election.contests) {
    strings.push({
      key: ElectionStringKey.CONTEST_TITLE,
      subkey: contest.id,
      text: contest.title,
    });

    switch (contest.type) {
      case 'candidate':
        if (contest.termDescription) {
          strings.push({
            key: ElectionStringKey.CONTEST_TERM,
            subkey: contest.id,
            text: contest.termDescription,
          });
        }

        for (const candidate of contest.candidates) {
          strings.push({
            key: ElectionStringKey.CANDIDATE_NAME,
            subkey: candidate.id,
            text: candidate.name,
          });
        }

        break;

      case 'yesno':
        strings.push({
          key: ElectionStringKey.CONTEST_DESCRIPTION,
          subkey: contest.id,
          text: convertHtmlToAudioCues(contest.description),
        });

        for (const option of contest.options) {
          strings.push({
            key: ElectionStringKey.CONTEST_OPTION_LABEL,
            subkey: option.id,
            text: option.label,
          });
        }

        break;

      case 'straight-party':
        break;

      default:
        throwIllegalValue(contest, 'type');
    }
  }

  // eslint-disable-next-line vx/no-array-sort-mutation
  return strings.sort((a, b) =>
    a.text.localeCompare(b.text, LanguageCode.ENGLISH, {
      ignorePunctuation: true,
      numeric: true,
    })
  );
}
