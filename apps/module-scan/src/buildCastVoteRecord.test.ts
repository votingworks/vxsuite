import {
  AdjudicationReason,
  getBallotStyle,
  getContests,
  vote,
  BallotType,
} from '@votingworks/types'
import { election } from '../test/fixtures/2020-choctaw'
import { buildCastVoteRecord } from './buildCastVoteRecord'
import { MarkStatus } from './types/ballot-review'

test('generates a CVR from a completed BMD ballot', () => {
  const sheetId = 'sheetid'
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'
  const precinctId = '6522'
  const ballotStyle = getBallotStyle({ ballotStyleId, election })!
  const contests = getContests({ ballotStyle, election })

  const blankPageTypes = ['BlankPage', 'UnreadablePage']
  blankPageTypes.forEach((blankPageType: string) => {
    expect(
      buildCastVoteRecord(sheetId, ballotId, election, [
        {
          interpretation: {
            type: 'InterpretedBmdPage',
            ballotId,
            metadata: {
              locales: { primary: 'en-US' },
              electionHash: '',
              ballotType: BallotType.Standard,
              ballotStyleId,
              precinctId,
              isTestMode: false,
            },
            votes: vote(contests, {
              '1': '1',
              '2': '22',
              'initiative-65': ['yes', 'no'],
            }),
          },
        },
        {
          interpretation: {
            type: blankPageType as 'BlankPage' | 'UnreadablePage',
          },
        },
      ])
    ).toMatchInlineSnapshot(`
    Object {
      "1": Array [
        "1",
      ],
      "2": Array [
        "22",
      ],
      "3": Array [],
      "4": Array [],
      "_ballotId": "abcdefg",
      "_ballotStyleId": "1",
      "_ballotType": "standard",
      "_locales": Object {
        "primary": "en-US",
      },
      "_precinctId": "6522",
      "_scannerId": "000",
      "_testBallot": false,
      "flag-question": Array [],
      "initiative-65": Array [
        "yes",
        "no",
      ],
      "initiative-65-a": Array [],
      "runoffs-question": Array [],
    }
    `)
  })
})
test('generates a CVR from a completed BMD ballot with write in and overvotes', () => {
  const sheetId = 'sheetid'
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'
  const precinctId = '6522'
  const ballotStyle = getBallotStyle({ ballotStyleId, election })!
  const contests = getContests({ ballotStyle, election })

  const blankPageTypes = ['BlankPage', 'UnreadablePage']
  blankPageTypes.forEach((blankPageType: string) => {
    expect(
      buildCastVoteRecord(sheetId, ballotId, election, [
        {
          interpretation: {
            type: 'InterpretedBmdPage',
            ballotId,
            metadata: {
              locales: { primary: 'en-US' },
              electionHash: '',
              ballotType: BallotType.Standard,
              ballotStyleId,
              precinctId,
              isTestMode: false,
            },
            votes: vote(contests, {
              '1': {
                id: 'write-in__PIKACHU',
                name: 'Pikachu',
                isWriteIn: true,
              },
              '2': ['21', '22'],
            }),
          },
        },
        {
          interpretation: {
            type: blankPageType as 'BlankPage' | 'UnreadablePage',
          },
        },
      ])
    ).toMatchInlineSnapshot(`
    Object {
      "1": Array [
        "write-in__PIKACHU",
      ],
      "2": Array [
        "21",
        "22",
      ],
      "3": Array [],
      "4": Array [],
      "_ballotId": "abcdefg",
      "_ballotStyleId": "1",
      "_ballotType": "standard",
      "_locales": Object {
        "primary": "en-US",
      },
      "_precinctId": "6522",
      "_scannerId": "000",
      "_testBallot": false,
      "flag-question": Array [],
      "initiative-65": Array [],
      "initiative-65-a": Array [],
      "runoffs-question": Array [],
    }
    `)
  })
})

test('generates a CVR from a completed HMPB page', () => {
  const sheetId = 'sheetid'
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'
  const precinctId = '6522'
  const ballotStyle = getBallotStyle({ ballotStyleId, election })!
  const contests = getContests({ ballotStyle, election })

  expect(
    buildCastVoteRecord(sheetId, ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          ballotId: 'abcdefg',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId,
            precinctId,
            isTestMode: false,
            pageNumber: 1,
          },
          markInfo: { marks: [], ballotSize: { width: 1, height: 1 } },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            allReasonInfos: [],
          },
          votes: vote(contests, {
            '1': '1',
            '2': '22',
          }),
        },
        contestIds: ['1', '2'],
      },
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          ballotId: 'abcdefg',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId,
            precinctId,
            isTestMode: false,
            pageNumber: 2,
          },
          markInfo: { marks: [], ballotSize: { width: 1, height: 1 } },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            allReasonInfos: [],
          },
          votes: vote(contests, {
            'initiative-65': ['yes', 'no'],
          }),
        },
        contestIds: ['initiative-65'],
      },
    ])
  ).toMatchInlineSnapshot(`
    Object {
      "1": Array [
        "1",
      ],
      "2": Array [
        "22",
      ],
      "_ballotId": "abcdefg",
      "_ballotStyleId": "1",
      "_ballotType": "standard",
      "_locales": Object {
        "primary": "en-US",
      },
      "_pageNumbers": Array [
        1,
        2,
      ],
      "_precinctId": "6522",
      "_scannerId": "000",
      "_testBallot": false,
      "initiative-65": Array [
        "yes",
        "no",
      ],
    }
  `)
})

test('generates a CVR from a completed HMPB page with write in votes and overvotes', () => {
  const sheetId = 'sheetid'
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'
  const precinctId = '6522'
  const ballotStyle = getBallotStyle({ ballotStyleId, election })!
  const contests = getContests({ ballotStyle, election })

  expect(
    buildCastVoteRecord(sheetId, ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          ballotId: 'abcdefg',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId,
            precinctId,
            isTestMode: false,
            pageNumber: 1,
          },
          markInfo: { marks: [], ballotSize: { width: 1, height: 1 } },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            allReasonInfos: [],
          },
          votes: vote(contests, {
            '1': { id: '__write-in-0', name: 'Pikachu', isWriteIn: true },
            '2': ['21', '22'],
          }),
        },
        contestIds: ['1', '2'],
      },
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          ballotId: 'abcdefg',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId,
            precinctId,
            isTestMode: false,
            pageNumber: 2,
          },
          markInfo: { marks: [], ballotSize: { width: 1, height: 1 } },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            allReasonInfos: [],
          },
          votes: vote(contests, {
            'initiative-65': ['yes', 'no'],
          }),
        },
        contestIds: ['initiative-65'],
      },
    ])
  ).toMatchInlineSnapshot(`
    Object {
      "1": Array [
        "__write-in-0",
      ],
      "2": Array [
        "21",
        "22",
      ],
      "_ballotId": "abcdefg",
      "_ballotStyleId": "1",
      "_ballotType": "standard",
      "_locales": Object {
        "primary": "en-US",
      },
      "_pageNumbers": Array [
        1,
        2,
      ],
      "_precinctId": "6522",
      "_scannerId": "000",
      "_testBallot": false,
      "initiative-65": Array [
        "yes",
        "no",
      ],
    }
  `)
})

test('generates a CVR from a completed absentee HMPB page', () => {
  const sheetId = 'sheetid'
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'
  const precinctId = '6522'
  const ballotStyle = getBallotStyle({ ballotStyleId, election })!
  const contests = getContests({ ballotStyle, election })

  expect(
    buildCastVoteRecord(sheetId, ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          ballotId: 'abcdefg',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Absentee,
            ballotStyleId,
            precinctId,
            isTestMode: false,
            pageNumber: 1,
          },
          markInfo: { marks: [], ballotSize: { width: 1, height: 1 } },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            allReasonInfos: [],
          },
          votes: vote(contests, {
            '1': '1',
            '2': '22',
          }),
        },
        contestIds: ['1', '2'],
      },
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          ballotId: 'abcdefg',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId,
            precinctId,
            isTestMode: false,
            pageNumber: 2,
          },
          markInfo: { marks: [], ballotSize: { width: 1, height: 1 } },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            allReasonInfos: [],
          },
          votes: vote(contests, {
            'initiative-65': ['yes', 'no'],
          }),
        },
        contestIds: ['initiative-65'],
      },
    ])
  ).toMatchInlineSnapshot(`
    Object {
      "1": Array [
        "1",
      ],
      "2": Array [
        "22",
      ],
      "_ballotId": "abcdefg",
      "_ballotStyleId": "1",
      "_ballotType": "absentee",
      "_locales": Object {
        "primary": "en-US",
      },
      "_pageNumbers": Array [
        1,
        2,
      ],
      "_precinctId": "6522",
      "_scannerId": "000",
      "_testBallot": false,
      "initiative-65": Array [
        "yes",
        "no",
      ],
    }
  `)
})

test('generates a CVR from an adjudicated HMPB page', () => {
  const sheetId = 'sheetid'
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'
  const precinctId = '6522'
  const ballotStyle = getBallotStyle({ ballotStyleId, election })!
  const contests = getContests({ ballotStyle, election })

  expect(
    buildCastVoteRecord(sheetId, ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          ballotId: 'abcdefg',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId,
            precinctId,
            isTestMode: false,
            pageNumber: 2,
          },
          markInfo: { marks: [], ballotSize: { width: 1, height: 1 } },
          adjudicationInfo: {
            requiresAdjudication: true,
            enabledReasons: [AdjudicationReason.Overvote],
            allReasonInfos: [
              {
                type: AdjudicationReason.Overvote,
                contestId: 'initiative-65',
                expected: 1,
                optionIds: ['yes', 'no'],
              },
            ],
          },
          votes: vote(contests, {
            'initiative-65': ['yes', 'no'],
          }),
        },
        adjudication: {
          'initiative-65': {
            no: MarkStatus.Unmarked,
          },
        },
        contestIds: ['initiative-65'],
      },
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          ballotId: 'abcdefg',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId,
            precinctId,
            isTestMode: false,
            pageNumber: 1,
          },
          markInfo: { marks: [], ballotSize: { width: 1, height: 1 } },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [AdjudicationReason.Overvote],
            allReasonInfos: [],
          },
          votes: vote(contests, {
            '1': '1',
            '2': '22',
          }),
        },
        contestIds: ['1', '2'],
      },
    ])
  ).toMatchInlineSnapshot(`
    Object {
      "1": Array [
        "1",
      ],
      "2": Array [
        "22",
      ],
      "_ballotId": "abcdefg",
      "_ballotStyleId": "1",
      "_ballotType": "standard",
      "_locales": Object {
        "primary": "en-US",
      },
      "_pageNumbers": Array [
        1,
        2,
      ],
      "_precinctId": "6522",
      "_scannerId": "000",
      "_testBallot": false,
      "initiative-65": Array [
        "yes",
      ],
    }
  `)
})

test('fails to generate a CVR from an invalid HMPB sheet with two pages having the same page number', () => {
  const sheetId = 'sheetid'
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'
  const precinctId = '6522'

  expect(() =>
    buildCastVoteRecord(sheetId, ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId,
            precinctId,
            isTestMode: false,
            pageNumber: 1,
          },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            allReasonInfos: [],
          },
          markInfo: {
            marks: [],
            ballotSize: { width: 1, height: 1 },
          },
          votes: {},
        },
      },
      {
        interpretation: {
          type: 'UninterpretedHmpbPage',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId,
            precinctId,
            isTestMode: false,
            pageNumber: 1,
          },
        },
      },
    ])
  ).toThrowError(
    'expected a sheet to have consecutive page numbers, but got front=1 back=1'
  )
})

test('fails to generate a CVR from an invalid HMPB sheet with two non-consecutive pages', () => {
  const sheetId = 'sheetid'
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'
  const precinctId = '6522'

  expect(() =>
    buildCastVoteRecord(sheetId, ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId,
            precinctId,
            isTestMode: false,
            pageNumber: 1,
          },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            allReasonInfos: [],
          },
          markInfo: {
            marks: [],
            ballotSize: { width: 1, height: 1 },
          },
          votes: {},
        },
      },
      {
        interpretation: {
          type: 'UninterpretedHmpbPage',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId,
            precinctId,
            isTestMode: false,
            pageNumber: 3,
          },
        },
      },
    ])
  ).toThrowError(
    'expected a sheet to have consecutive page numbers, but got front=1 back=3'
  )
})

test('fails to generate a CVR from an invalid HMPB sheet with different ballot styles', () => {
  const sheetId = 'sheetid'
  const ballotId = 'abcdefg'
  const precinctId = '6522'

  expect(() =>
    buildCastVoteRecord(sheetId, ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId: '1',
            precinctId,
            isTestMode: false,
            pageNumber: 1,
          },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            allReasonInfos: [],
          },
          markInfo: {
            marks: [],
            ballotSize: { width: 1, height: 1 },
          },
          votes: {},
        },
      },
      {
        interpretation: {
          type: 'UninterpretedHmpbPage',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId: '2',
            precinctId,
            isTestMode: false,
            pageNumber: 2,
          },
        },
      },
    ])
  ).toThrowError(
    'expected a sheet to have the same ballot style, but got front=1 back=2'
  )
})

test('fails to generate a CVR from an invalid HMPB sheet with different precincts', () => {
  const sheetId = 'sheetid'
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'

  expect(() =>
    buildCastVoteRecord(sheetId, ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId,
            precinctId: '6522',
            isTestMode: false,
            pageNumber: 1,
          },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            allReasonInfos: [],
          },
          markInfo: {
            marks: [],
            ballotSize: { width: 1, height: 1 },
          },
          votes: {},
        },
      },
      {
        interpretation: {
          type: 'UninterpretedHmpbPage',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId,
            precinctId: '6523',
            isTestMode: false,
            pageNumber: 2,
          },
        },
      },
    ])
  ).toThrowError(
    'expected a sheet to have the same precinct, but got front=6522 back=6523'
  )
})

test('generates a CVR from an adjudicated uninterpreted HMPB page', () => {
  const sheetId = 'sheetid'
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'
  const precinctId = '6522'

  expect(
    buildCastVoteRecord(sheetId, ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId,
            precinctId,
            isTestMode: false,
            pageNumber: 1,
          },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            allReasonInfos: [],
          },
          markInfo: {
            marks: [],
            ballotSize: { width: 1, height: 1 },
          },
          votes: {
            '2': [
              {
                id: '23',
                name: 'Jimmy Edwards',
                partyId: '4',
              },
            ],
          },
        },
        contestIds: ['1', '2'],
        adjudication: {
          '1': { '2': MarkStatus.Marked },
        },
      },
      {
        interpretation: {
          type: 'UninterpretedHmpbPage',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId,
            precinctId,
            isTestMode: false,
            pageNumber: 2,
          },
        },
        contestIds: ['initiative-65'],
        adjudication: {
          'initiative-65': {
            no: MarkStatus.Marked,
          },
        },
      },
    ])
  ).toMatchInlineSnapshot(`
    Object {
      "1": Array [
        "2",
      ],
      "2": Array [
        "23",
      ],
      "_ballotId": "abcdefg",
      "_ballotStyleId": "1",
      "_ballotType": "standard",
      "_locales": Object {
        "primary": "en-US",
      },
      "_pageNumbers": Array [
        1,
        2,
      ],
      "_precinctId": "6522",
      "_scannerId": "000",
      "_testBallot": false,
      "initiative-65": Array [
        "no",
      ],
    }
  `)
})

test('fails to generate CVRs from blank pages', () => {
  const sheetId = 'sheetid'
  const ballotId = 'abcdefg'

  expect(
    buildCastVoteRecord(sheetId, ballotId, election, [
      { interpretation: { type: 'BlankPage' } },
      { interpretation: { type: 'BlankPage' } },
    ])
  ).toBeUndefined()
})

test('fails to generate CVRs from invalid test mode pages', () => {
  const sheetId = 'sheetid'
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'
  const precinctId = '6522'

  expect(
    buildCastVoteRecord(sheetId, ballotId, election, [
      {
        interpretation: {
          type: 'InvalidTestModePage',
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId,
            precinctId,
            isTestMode: false,
          },
        },
      },
      { interpretation: { type: 'BlankPage' } },
    ])
  ).toBeUndefined()
})
