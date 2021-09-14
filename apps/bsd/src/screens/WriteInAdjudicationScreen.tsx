/**
 * FIXME: This file was written in haste and could use some cleanup.
 * - separate components into multiple files?
 * - use better styling/css?
 * - add more testing
 */

import {
  AdjudicationReason,
  BallotPageContestLayout,
  CandidateContest,
  Contest,
  ContestOption,
  ElectionDefinition,
  InterpretedHmpbPage,
  Rect,
  SerializableBallotPageLayout,
  WriteInAdjudicationReasonInfo,
} from '@votingworks/types'
import { Side } from '@votingworks/types/api/module-scan'
import { Text, useCancelablePromise } from '@votingworks/ui'
import { find } from '@votingworks/utils'
import { strict as assert } from 'assert'
import pluralize from 'pluralize'
import React, { useCallback, useContext, useEffect, useState } from 'react'
import styled from 'styled-components'
import BallotSheetImage from '../components/BallotSheetImage'
import Button from '../components/Button'
import CroppedImage from '../components/CroppedImage'
import Main from '../components/Main'
import MainNav from '../components/MainNav'
import Prose from '../components/Prose'
import Screen from '../components/Screen'
import AppContext from '../contexts/AppContext'

const Stack = ({
  as = 'div',
  children,
  flexDirection,
  style,
}: {
  as?: string
  children: React.ReactNode
  flexDirection: React.CSSProperties['flexDirection']
  style?: React.CSSProperties
}): JSX.Element => {
  return React.createElement(
    as,
    { style: { display: 'flex', flex: '1', flexDirection, ...style } },
    null,
    ...(Array.isArray(children) ? children : [children])
  )
}

const VStack = ({
  as,
  children,
  style,
}: {
  as?: string
  children: React.ReactNode
  style?: React.CSSProperties
}): JSX.Element => (
  <Stack as={as} flexDirection="column" style={style}>
    {children}
  </Stack>
)

const HStack = ({
  as,
  children,
  style,
}: {
  as?: string
  children: React.ReactNode
  style?: React.CSSProperties
}): JSX.Element => (
  <Stack as={as} flexDirection="row" style={style}>
    {children}
  </Stack>
)

const Spacer = ({
  flex = 1,
}: {
  flex?: React.CSSProperties['flex']
}): JSX.Element => <div style={{ flex }} />

const Header = styled.div`
  font-size: 3em;
  font-weight: 900;
`

const ContestHeader = styled.div`
  font-size: 1.5em;
  font-weight: 900;
`

const MainChildColumns = styled.div`
  flex: 1;
  display: flex;
  margin-bottom: -1rem;
  > div {
    margin-right: 1em;
    &:first-child {
      flex: 1;
    }
    &:last-child {
      margin-right: 0;
    }
  }
  button {
    margin-top: 0.3rem;
  }
`

const HIGHLIGHTER_COLOR = '#fbff0016'
const FOCUS_COLOR = '#fbff007d'
const EXTRA_WRITE_IN_MARGIN_PERCENTAGE = 0.2

const WriteInAdjudicationBox = styled.div`
  background-color: #ffffff;
  padding: 20px 15px;
  margin: 1em 0;
`

export type WriteInsByOption = Record<ContestOption['id'], string>
export type WriteInsByContestAndOption = Record<Contest['id'], WriteInsByOption>

const WriteInLabel = ({
  contest,
  writeIn,
}: {
  contest: CandidateContest
  writeIn: WriteInAdjudicationReasonInfo
}) => (
  <HStack>
    <div>
      <strong>Write-In</strong>
    </div>
    <Text style={{ margin: '0 0.25em' }}>
      (line {writeIn.optionIndex - contest.candidates.length + 1})
    </Text>
  </HStack>
)

const WriteInImage = ({
  imageURL,
  bounds,
}: {
  imageURL: string
  bounds: Rect
}) => (
  <CroppedImage
    src={imageURL}
    alt="write-in area"
    crop={{
      x: bounds.x,
      y: bounds.y - bounds.height * EXTRA_WRITE_IN_MARGIN_PERCENTAGE,
      width: bounds.width,
      height: bounds.height * (1 + 2 * EXTRA_WRITE_IN_MARGIN_PERCENTAGE),
    }}
    style={{
      boxShadow: '4px 4px 3px 3px #999',
      width: '50%',
    }}
  />
)

interface ContestAdjudicationProps {
  imageURL: string
  contest: CandidateContest
  layout: BallotPageContestLayout
  writeInsForContest: readonly WriteInAdjudicationReasonInfo[]
  onInput?(optionId: ContestOption['id'], value: string): void
  writeInValues?: WriteInsByOption
}

const ContestAdjudication = ({
  imageURL,
  contest,
  layout,
  writeInsForContest,
  onInput,
  writeInValues,
}: ContestAdjudicationProps): JSX.Element => {
  const onInputInternal: React.FormEventHandler = useCallback(
    (event) => {
      const input = event.currentTarget as HTMLInputElement
      const { optionId } = input.dataset
      if (optionId) {
        onInput?.(optionId, input.value)
      }
    },
    [onInput]
  )

  return (
    <div>
      <HStack style={{ alignItems: 'center' }}>
        <ContestHeader>{contest.title}</ContestHeader>
      </HStack>
      {writeInsForContest.map((writeIn, i) => {
        const writeInIndex = writeIn.optionIndex
        const { bounds } = layout.options[writeInIndex]
        return (
          <WriteInAdjudicationBox key={writeIn.optionId}>
            <HStack>
              <WriteInImage imageURL={imageURL} bounds={bounds} />
              <Spacer />
              <VStack as="label">
                <WriteInLabel contest={contest} writeIn={writeIn} />
                <input
                  type="text"
                  placeholder="type voter write-in here"
                  autoComplete="off"
                  style={{ width: '450px', fontSize: '1.5em' }}
                  data-option-id={writeIn.optionId}
                  data-testid={`write-in-input-${writeIn.optionId}`}
                  onInput={onInputInternal}
                  defaultValue={writeInValues?.[writeIn.optionId]}
                  tabIndex={i + 1}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus={i === 0}
                />
                <Spacer />
              </VStack>
            </HStack>
          </WriteInAdjudicationBox>
        )
      })}
    </div>
  )
}

const WriteInAdjudicationByContest = ({
  electionDefinition,
  imageURL,
  interpretation,
  layout,
  contestIds,
  writeInValues,
  onContestChange,
  onWriteInChanged,
  onAdjudicationComplete,
}: {
  electionDefinition: ElectionDefinition
  imageURL: string
  interpretation: InterpretedHmpbPage
  layout: SerializableBallotPageLayout
  contestIds: readonly Contest['id'][]
  writeInValues: WriteInsByContestAndOption
  onContestChange?(contestId?: Contest['id']): void
  onWriteInChanged?(
    contestId: Contest['id'],
    optionId: ContestOption['id'],
    value: string
  ): void
  onAdjudicationComplete(): Promise<void>
}): JSX.Element => {
  const makeCancelable = useCancelablePromise()
  const [isSaving, setIsSaving] = useState(false)
  const [selectedContestIndex, setSelectedContestIndex] = useState(0)

  const writeIns = interpretation.adjudicationInfo.allReasonInfos.filter(
    (reason): reason is WriteInAdjudicationReasonInfo =>
      reason.type === AdjudicationReason.WriteIn
  )
  const contestsWithWriteIns = new Set(
    [...writeIns].map(({ contestId }) => contestId)
  )
  const contestsWithWriteInsCount = contestsWithWriteIns.size
  const selectedContestId = [...contestsWithWriteIns][selectedContestIndex]
  const isFirstContestSelected = selectedContestIndex === 0
  const isLastContestSelected =
    selectedContestIndex === contestsWithWriteInsCount - 1

  const onWriteInInput = useCallback(
    (optionId: ContestOption['id'], value: string) => {
      onWriteInChanged?.(selectedContestId, optionId, value)
    },
    [onWriteInChanged, selectedContestId]
  )

  useEffect(() => {
    onContestChange?.(selectedContestId)
  }, [selectedContestId, onContestChange])

  const contestIndex = contestIds.findIndex((id) => id === selectedContestId)
  const contestsWithWriteInsIndex = [...contestsWithWriteIns].findIndex(
    (id) => id === selectedContestId
  )
  const contest = find(
    electionDefinition.election.contests,
    (c): c is CandidateContest => c.id === selectedContestId
  )
  const writeInsForContest = writeIns.filter(
    (writeIn) => writeIn.contestId === selectedContestId
  )
  const contestLayout = layout.contests[contestIndex]
  const allWriteInsHaveValues = writeInsForContest.every(
    (writeIn) => writeInValues[selectedContestId]?.[writeIn.optionId]
  )

  const goPrevious = useCallback(() => {
    setSelectedContestIndex((prev) => Math.max(0, prev - 1))
  }, [])
  const goNext = useCallback(
    async (event?: React.FormEvent<EventTarget>): Promise<void> => {
      event?.preventDefault()
      if (isLastContestSelected) {
        setIsSaving(true)
        try {
          await makeCancelable(onAdjudicationComplete())
        } finally {
          setIsSaving(false)
        }
      } else {
        setSelectedContestIndex((prev) => prev + 1)
      }
    },
    [isLastContestSelected, makeCancelable, onAdjudicationComplete]
  )

  return (
    <form onSubmit={goNext}>
      <p>
        This ballot image has{' '}
        <strong>{pluralize('contest', contestsWithWriteIns.size, true)}</strong>{' '}
        with write-ins. Adjudicate each write-in by typing each write-in’s name
        into the text box next to the image. Click “Next Contest” to move to the
        next contest.
      </p>
      <ContestAdjudication
        key={selectedContestId}
        imageURL={imageURL}
        contest={contest}
        writeInsForContest={writeInsForContest}
        layout={contestLayout}
        onInput={onWriteInInput}
        writeInValues={writeInValues[selectedContestId]}
      />
      <HStack>
        <Button
          onPress={goPrevious}
          disabled={isFirstContestSelected}
          tabIndex={contestLayout.options.length + 2}
        >
          Previous Contest
        </Button>
        <Spacer />
        <Text small style={{ marginLeft: '10px' }}>
          Contest {contestsWithWriteInsIndex + 1} of {contestsWithWriteInsCount}
        </Text>
        <Spacer />
        <Button
          onPress={goNext}
          primary
          disabled={isSaving || !allWriteInsHaveValues}
          tabIndex={contestLayout.options.length + 1}
        >
          {!isLastContestSelected ? 'Next Contest' : 'Save & Continue Scanning'}
        </Button>
      </HStack>
    </form>
  )
}

export interface Props {
  sheetId: string
  side: Side
  imageURL: string
  interpretation: InterpretedHmpbPage
  layout: SerializableBallotPageLayout
  contestIds: readonly Contest['id'][]
  onAdjudicationComplete?(
    sheetId: string,
    side: Side,
    writeInValues: WriteInsByContestAndOption
  ): Promise<void>
}

export default function WriteInAdjudicationScreen({
  sheetId,
  side,
  imageURL,
  interpretation,
  layout,
  contestIds,
  onAdjudicationComplete,
}: Props): JSX.Element {
  const { electionDefinition } = useContext(AppContext)
  assert(electionDefinition)

  const [
    writeInValues,
    setWriteInValues,
  ] = useState<WriteInsByContestAndOption>({})
  const [selectedContestId, setSelectedContestId] = useState<Contest['id']>()

  const writeIns = interpretation.adjudicationInfo.allReasonInfos.filter(
    (reason): reason is WriteInAdjudicationReasonInfo =>
      reason.type === AdjudicationReason.WriteIn
  )
  const styleForContest = useCallback(
    (id: Contest['id']): React.CSSProperties => {
      const contestsWithWriteIns = new Set(
        [...writeIns].map(({ contestId }) => contestId)
      )
      return id === selectedContestId
        ? { backgroundColor: FOCUS_COLOR }
        : contestsWithWriteIns.has(id)
        ? { backgroundColor: HIGHLIGHTER_COLOR }
        : {}
    },
    [selectedContestId, writeIns]
  )

  const onContestChange = useCallback((contestId?: Contest['id']): void => {
    setSelectedContestId(contestId)
  }, [])

  const onWriteInChanged = useCallback(
    (
      contestId: Contest['id'],
      optionId: ContestOption['id'],
      value: string
    ): void => {
      setWriteInValues((prev) => ({
        ...prev,
        [contestId]: {
          ...prev[contestId],
          [optionId]: value,
        },
      }))
    },
    []
  )

  const onAdjudicationCompleteInternal = useCallback(async (): Promise<void> => {
    await onAdjudicationComplete?.(sheetId, side, writeInValues)
  }, [onAdjudicationComplete, sheetId, side, writeInValues])

  return (
    <Screen>
      <MainNav />
      <Main>
        <MainChildColumns>
          <Prose maxWidth={false}>
            <Header>Write-In Adjudication</Header>
            <WriteInAdjudicationByContest
              electionDefinition={electionDefinition}
              imageURL={imageURL}
              interpretation={interpretation}
              layout={layout}
              contestIds={contestIds}
              writeInValues={writeInValues}
              onContestChange={onContestChange}
              onWriteInChanged={onWriteInChanged}
              onAdjudicationComplete={onAdjudicationCompleteInternal}
            />
          </Prose>
          <BallotSheetImage
            imageURL={imageURL}
            layout={layout}
            contestIds={contestIds}
            styleForContest={styleForContest}
          />
        </MainChildColumns>
      </Main>
    </Screen>
  )
}
