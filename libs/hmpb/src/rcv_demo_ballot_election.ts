/* istanbul ignore file - DEMO */
import { DateWithoutTime, range } from '@votingworks/basics';
import {
  Candidate,
  CandidateContest,
  DistrictId,
  Election,
  HmpbBallotPaperSize,
  UiStringsPackage,
} from '@votingworks/types';
import {
  generateBallotStyleGroupId,
  generateBallotStyleId,
} from '@votingworks/utils';
import { RCV_DEMO_SEAL } from './rcv_demo_ballot_seal';

// A hand-crafted demo election for demonstrating a ranked-choice voting (RCV)
// contest without RCV support in the system. The single RCV contest — the
// November 2025 Santa Clara County Assessor special election, which went to a
// December runoff that RCV would have avoided — is modeled as one vote-for-1
// contest per rank. The CA ballot template renders the rank contests together
// as a single ranked-choice grid (see RcvContest in ca_ballot_template.tsx),
// and RCV tabulation rules are applied outside the system. This model gives
// the semantics we want for free: two marks in one rank column are an
// overvote of that rank's contest, while ranking the same candidate at
// multiple ranks is not an overvote.

export const RCV_DEMO_NUM_RANKS = 4;

export const RCV_DEMO_CONTEST_ID_PREFIX = 'county-assessor-rank-';

export function rcvDemoContestId(rank: number): string {
  return `${RCV_DEMO_CONTEST_ID_PREFIX}${rank}`;
}

export interface RcvDemoStrings {
  readonly contestTitle: string;
  readonly instructions: string;
  readonly rankLabels: readonly string[];
}

// Strings for the ranked-choice grid, which isn't expressible with the
// standard contest strings. Keyed by language code; the CA template renders
// the ballot's primary language alongside English.
export const RCV_DEMO_STRINGS: Record<string, RcvDemoStrings> = {
  en: {
    contestTitle: 'Assessor',
    instructions:
      'Rank candidates in the order of your choice. Mark no more than one ' +
      'choice per column. To rank fewer candidates, leave the remaining ' +
      'columns blank.',
    rankLabels: ['1st Choice', '2nd Choice', '3rd Choice', '4th Choice'],
  },
  'es-US': {
    contestTitle: 'Tasador',
    instructions:
      'Clasifica a los candidatos en el orden de tu preferencia. Marca no ' +
      'más de una opción por columna. Para clasificar a menos candidatos, ' +
      'deja las columnas restantes en blanco.',
    rankLabels: ['1.ª opción', '2.ª opción', '3.ª opción', '4.ª opción'],
  },
};

// Ballot designations approximated from news coverage of the actual
// November 4, 2025 special election.
const candidates: Candidate[] = [
  {
    id: 'neysa-fligor',
    name: 'Neysa Fligor',
    designation: 'Assistant County Assessor',
  },
  {
    id: 'rishi-kumar',
    name: 'Rishi Kumar',
    designation: 'Technology Executive',
  },
  {
    id: 'yan-zhao',
    name: 'Yan Zhao',
    designation: 'Councilmember, City of Saratoga',
  },
  {
    id: 'bryan-do',
    name: 'Bryan Do',
    designation: 'School Governing Board Member',
  },
];

const districtId = 'county-of-santa-clara' as DistrictId;
const precinctId = 'precinct-1';

function createBallotStrings(contests: CandidateContest[]): UiStringsPackage {
  return {
    en: {
      ballotLanguage: 'English',
      electionTitle: 'Special General Election',
      electionDate: 'November 4, 2025',
      jurisdictionName: 'County of Santa Clara',
      stateName: 'State of California',
      districtName: { [districtId]: 'County of Santa Clara' },
      precinctName: { [precinctId]: 'Precinct 1' },
      contestTitle: Object.fromEntries(
        contests.map((contest) => [contest.id, contest.title])
      ),
      candidateDesignation: Object.fromEntries(
        candidates.map((candidate) => [
          candidate.id,
          candidate.designation ?? '',
        ])
      ),
    },
    // Spanish translations: the standard hmpb strings are copied from the
    // translated @votingworks/fixtures electionGeneral ballot strings; the
    // CA-specific and election-specific strings are machine-translated
    // drafts.
    'es-US': {
      ballotLanguage: 'español (EE. UU.)',
      electionTitle: 'Elección General Especial',
      electionDate: '4 de noviembre de 2025',
      jurisdictionName: 'Condado de Santa Clara',
      stateName: 'Estado de California',
      districtName: { [districtId]: 'Condado de Santa Clara' },
      precinctName: { [precinctId]: 'Precinto 1' },
      contestTitle: Object.fromEntries(
        contests.map((contest, i) => [
          contest.id,
          `Tasador – ${RCV_DEMO_STRINGS['es-US'].rankLabels[i]}`,
        ])
      ),
      candidateDesignation: {
        'neysa-fligor': 'Tasadora Auxiliar del Condado',
        'rishi-kumar': 'Ejecutivo de Tecnología',
        'yan-zhao': 'Concejala de la Ciudad de Saratoga',
        'bryan-do': 'Miembro de la Junta Directiva Escolar',
      },
      hmpbOfficialBallot: 'Boleta oficial',
      hmpbTestBallot: 'Boleta de prueba',
      hmpbSampleBallot: 'Boleta de muestra',
      hmpbInstructions: 'Instrucciones',
      hmpbInstructionsToVoteTitle: 'Para votar:',
      hmpbInstructionsToVoteText:
        'Para votar, llena completamente el óvalo junto a tu elección.',
      hmpbPage: 'Página',
      hmpbPageIntentionallyBlank: 'Esta página está intencionalmente en blanco',
      hmpbVotingComplete: 'Has completado la votación.',
      hmpbContinueVotingOnBack: 'Voltea la boleta y continúa votando',
      hmpbContinueVotingOnNextSheet:
        'Continúa votando en la siguiente hoja de la boleta',
      hmpbCaVoterNominatedOfficesTitle:
        'Cargos nominados por los votantes y cargos no partidistas',
      hmpbCaVoterNominatedOfficesText:
        'Los candidatos muestran una preferencia de partido (o Ninguna) ' +
        'para la información de los votantes. Esto no es un respaldo ni una ' +
        'aprobación del partido.',
      hmpbCaVoterNominatedOfficesShortTitle:
        'Cargos nominados por los votantes',
      hmpbCaNonpartisanOfficesTitle: 'Cargos no partidistas',
      hmpbPartyPreference: 'Preferencia de partido',
      hmpbNone: 'Ninguna',
    },
  };
}

export function createRcvDemoElection(): Election {
  const contests: CandidateContest[] = range(1, RCV_DEMO_NUM_RANKS + 1).map(
    (rank) => ({
      id: rcvDemoContestId(rank),
      type: 'candidate',
      title: `${RCV_DEMO_STRINGS['en'].contestTitle} – ${
        RCV_DEMO_STRINGS['en'].rankLabels[rank - 1]
      }`,
      districtId,
      seats: 1,
      allowWriteIns: false,
      nominationType: 'voter-nominated',
      candidates,
    })
  );

  return {
    id: 'rcv-demo-election',
    title: 'Special General Election',
    type: 'general',
    date: new DateWithoutTime('2025-11-04'),
    state: 'State of California',
    jurisdiction: {
      id: 'santa-clara-county',
      name: 'County of Santa Clara',
    },
    districts: [
      {
        id: districtId,
        name: 'County of Santa Clara',
      },
    ],
    precincts: [
      {
        id: precinctId,
        name: 'Precinct 1',
        districtIds: [districtId],
      },
    ],
    pollingPlaces: [
      {
        id: 'polling-place-1',
        name: 'Precinct 1',
        precincts: { [precinctId]: { type: 'whole' } },
        type: 'election_day',
      },
    ],
    parties: [],
    contests,
    // One ballot style per language, sharing a group, following the standard
    // generateBallotStyles model — the machines require an English ballot
    // style in every ballot style group. The Spanish style renders as the
    // dual-language Spanish/English ballot used for the demo.
    ballotStyles: ['en', 'es-US'].map((languageCode) => ({
      id: generateBallotStyleId({
        ballotStyleIndex: 1,
        languages: [languageCode],
      }),
      groupId: generateBallotStyleGroupId({ ballotStyleIndex: 1 }),
      districts: [districtId],
      precincts: [precinctId],
      languages: [languageCode],
    })),
    ballotLayout: {
      paperSize: HmpbBallotPaperSize.Letter,
      metadataEncoding: 'qr-code',
    },
    seal: RCV_DEMO_SEAL,
    ballotStrings: createBallotStrings(contests),
  };
}
