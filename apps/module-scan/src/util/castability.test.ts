import { BallotType } from '@votingworks/types'
import {
  BlankPage,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  UnreadablePage,
} from '../interpreter'
import { Castability, checkSheetCastability } from './castability'

const interpretedBmdPage: Readonly<InterpretedBmdPage> = {
  type: 'InterpretedBmdPage',
  ballotId: 'abc',
  metadata: {
    ballotStyleId: '1',
    precinctId: '6522',
    ballotType: BallotType.Standard,
    electionHash: '',
    isTestMode: false,
    locales: { primary: 'en-US' },
  },
  votes: {
    'flag-question': ['yes'],
  },
}

const interpretedHmpbPage: Readonly<InterpretedHmpbPage> = {
  type: 'InterpretedHmpbPage',
  ballotId: 'abcdefg',
  metadata: {
    locales: { primary: 'en-US' },
    electionHash: '',
    ballotType: BallotType.Standard,
    ballotStyleId: '1',
    precinctId: '6522',
    isTestMode: false,
    pageNumber: 1,
  },
  markInfo: { marks: [], ballotSize: { width: 1, height: 1 } },
  adjudicationInfo: {
    requiresAdjudication: false,
    enabledReasons: [],
    allReasonInfos: [],
  },
  votes: {},
}

const interpretedHmpbPageRequiringAdjudication: Readonly<InterpretedHmpbPage> = {
  ...interpretedHmpbPage,
  adjudicationInfo: {
    ...interpretedHmpbPage.adjudicationInfo,
    requiresAdjudication: true,
  },
}

const unreadablePage: Readonly<UnreadablePage> = { type: 'UnreadablePage' }

const blankPage: Readonly<BlankPage> = {
  type: 'BlankPage',
}

test('castability of a BMD ballot', () => {
  expect(checkSheetCastability([interpretedBmdPage, blankPage])).toEqual(
    Castability.CastableWithoutReview
  )
  expect(checkSheetCastability([blankPage, interpretedBmdPage])).toEqual(
    Castability.CastableWithoutReview
  )
})

test('castability of a blank sheet', () => {
  expect(checkSheetCastability([blankPage, blankPage])).toEqual(
    Castability.Uncastable
  )
})

test('castability of a HMPB ballot not requiring adjudication', () => {
  expect(
    checkSheetCastability([interpretedHmpbPage, interpretedHmpbPage])
  ).toEqual(Castability.CastableWithoutReview)
})

test('castability of a HMPB ballot requiring adjudication', () => {
  expect(
    checkSheetCastability([
      interpretedHmpbPageRequiringAdjudication,
      interpretedHmpbPage,
    ])
  ).toEqual(Castability.CastableWithReview)
  expect(
    checkSheetCastability([
      interpretedHmpbPage,
      interpretedHmpbPageRequiringAdjudication,
    ])
  ).toEqual(Castability.CastableWithReview)
})

test('castability of an unreadable ballot', () => {
  expect(checkSheetCastability([unreadablePage, unreadablePage])).toEqual(
    Castability.Uncastable
  )
})
