import {
  AdjudicationReason,
  getBallotStyle,
  getContests,
  vote,
} from '@votingworks/ballot-encoder'
import election from '../test/fixtures/2020-choctaw/election'
import { buildCastVoteRecord } from './buildCastVoteRecord'
import { MarkStatus } from './types/ballot-review'

test('generates a CVR from a completed BMD ballot', () => {
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'
  const precinctId = '6522'
  const ballotStyle = getBallotStyle({ ballotStyleId, election })!
  const contests = getContests({ ballotStyle, election })

  expect(
    buildCastVoteRecord(ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedBmdPage',
          ballotId,
          metadata: {
            ballotStyleId,
            precinctId,
            isTestBallot: false,
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
          type: 'BlankPage',
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
      "_locales": undefined,
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

test('generates a CVR from a completed HMPB page', () => {
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'
  const precinctId = '6522'
  const ballotStyle = getBallotStyle({ ballotStyleId, election })!
  const contests = getContests({ ballotStyle, election })

  expect(
    buildCastVoteRecord(ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          ballotId: 'abcdefg',
          metadata: {
            ballotStyleId,
            precinctId,
            isTestBallot: false,
            pageNumber: 1,
            pageCount: 2,
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
            ballotStyleId,
            precinctId,
            isTestBallot: false,
            pageNumber: 2,
            pageCount: 2,
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
      "_locales": undefined,
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
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'
  const precinctId = '6522'
  const ballotStyle = getBallotStyle({ ballotStyleId, election })!
  const contests = getContests({ ballotStyle, election })

  expect(
    buildCastVoteRecord(ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          ballotId: 'abcdefg',
          metadata: {
            ballotStyleId,
            precinctId,
            isTestBallot: false,
            pageNumber: 2,
            pageCount: 2,
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
            ballotStyleId,
            precinctId,
            isTestBallot: false,
            pageNumber: 1,
            pageCount: 2,
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
      "_locales": undefined,
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
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'
  const precinctId = '6522'

  expect(() =>
    buildCastVoteRecord(ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            ballotStyleId,
            precinctId,
            isTestBallot: false,
            pageNumber: 1,
            pageCount: 2,
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
            ballotStyleId,
            precinctId,
            isTestBallot: false,
            pageNumber: 1,
            pageCount: 2,
          },
        },
      },
    ])
  ).toThrowError(
    'expected a sheet to have consecutive page numbers, but got front=1 back=1'
  )
})

test('fails to generate a CVR from an invalid HMPB sheet with two non-consecutive pages', () => {
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'
  const precinctId = '6522'

  expect(() =>
    buildCastVoteRecord(ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            ballotStyleId,
            precinctId,
            isTestBallot: false,
            pageNumber: 1,
            pageCount: 2,
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
            ballotStyleId,
            precinctId,
            isTestBallot: false,
            pageNumber: 3,
            pageCount: 2,
          },
        },
      },
    ])
  ).toThrowError(
    'expected a sheet to have consecutive page numbers, but got front=1 back=3'
  )
})

test('fails to generate a CVR from an invalid HMPB sheet with different page counts', () => {
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'
  const precinctId = '6522'

  expect(() =>
    buildCastVoteRecord(ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            ballotStyleId,
            precinctId,
            isTestBallot: false,
            pageNumber: 1,
            pageCount: 2,
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
            ballotStyleId,
            precinctId,
            isTestBallot: false,
            pageNumber: 2,
            pageCount: 3,
          },
        },
      },
    ])
  ).toThrowError(
    'expected a sheet to have the same page count, but got front=2 back=3'
  )
})

test('fails to generate a CVR from an invalid HMPB sheet with different ballot styles', () => {
  const ballotId = 'abcdefg'
  const precinctId = '6522'

  expect(() =>
    buildCastVoteRecord(ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            ballotStyleId: '1',
            precinctId,
            isTestBallot: false,
            pageNumber: 1,
            pageCount: 2,
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
            ballotStyleId: '2',
            precinctId,
            isTestBallot: false,
            pageNumber: 2,
            pageCount: 2,
          },
        },
      },
    ])
  ).toThrowError(
    'expected a sheet to have the same ballot style, but got front=1 back=2'
  )
})

test('fails to generate a CVR from an invalid HMPB sheet with different precincts', () => {
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'

  expect(() =>
    buildCastVoteRecord(ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            ballotStyleId,
            precinctId: '6522',
            isTestBallot: false,
            pageNumber: 1,
            pageCount: 2,
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
            ballotStyleId,
            precinctId: '6523',
            isTestBallot: false,
            pageNumber: 2,
            pageCount: 2,
          },
        },
      },
    ])
  ).toThrowError(
    'expected a sheet to have the same precinct, but got front=6522 back=6523'
  )
})

test('generates a CVR from an adjudicated uninterpreted HMPB page', () => {
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'
  const precinctId = '6522'

  expect(
    buildCastVoteRecord(ballotId, election, [
      {
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            ballotStyleId,
            precinctId,
            isTestBallot: false,
            pageNumber: 1,
            pageCount: 2,
            locales: { primary: 'en-US' },
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
            ballotStyleId,
            precinctId,
            isTestBallot: false,
            pageNumber: 2,
            pageCount: 2,
            locales: { primary: 'en-US' },
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
  const ballotId = 'abcdefg'

  expect(
    buildCastVoteRecord(ballotId, election, [
      { interpretation: { type: 'BlankPage' } },
      { interpretation: { type: 'BlankPage' } },
    ])
  ).toBeUndefined()
})

test('fails to generate CVRs from invalid test mode pages', () => {
  const ballotId = 'abcdefg'
  const ballotStyleId = '1'
  const precinctId = '6522'

  expect(
    buildCastVoteRecord(ballotId, election, [
      {
        interpretation: {
          type: 'InvalidTestModePage',
          metadata: {
            ballotStyleId,
            precinctId,
            isTestBallot: false,
            locales: { primary: 'en-US' },
          },
        },
      },
      { interpretation: { type: 'BlankPage' } },
    ])
  ).toBeUndefined()
})
