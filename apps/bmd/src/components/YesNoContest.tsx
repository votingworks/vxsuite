import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  YesNoVote,
  OptionalYesNoVote,
  YesNoContest as YesNoContestInterface,
  Optional,
} from '@votingworks/ballot-encoder'

import {
  EventTargetFunction,
  ScrollDirections,
  UpdateVoteFunction,
  YesOrNo,
} from '../config/types'

import BallotContext from '../contexts/ballotContext'

import { FONT_SIZES, YES_NO_VOTES } from '../config/globals'
import ChoiceButton from './ChoiceButton'
import Button from './Button'
import Main from './Main'
import Modal from './Modal'
import Prose from './Prose'
import Text, { TextWithLineBreaks } from './Text'
import { getSingleYesNoVote } from '../utils/votes'
import {
  ContentHeader,
  ContestFooter,
  ContestSection,
  VariableContentContainer,
  ScrollControls,
  ScrollContainer,
  ScrollableContentWrapper,
  ChoicesGrid,
} from './ContestScreenLayout'

interface Props {
  contest: YesNoContestInterface
  vote: OptionalYesNoVote
  updateVote: UpdateVoteFunction
}

const YesNoContest: React.FC<Props> = ({ contest, vote, updateVote }) => {
  const context = useContext(BallotContext)
  const scrollContainer = useRef<HTMLDivElement>(null) // eslint-disable-line no-restricted-syntax

  const [isScrollable, setIsScrollable] = useState(false)
  const [isScrollAtBottom, setIsScrollAtBottom] = useState(true)
  const [isScrollAtTop, setIsScrollAtTop] = useState(true)
  const [overvoteSelection, setOvervoteSelection] = useState<
    Optional<YesOrNo>
  >()
  const [deselectedVote, setDeselectedVote] = useState('')

  useEffect(() => {
    if (deselectedVote !== '') {
      const timer = setTimeout(() => setDeselectedVote(''), 100)
      return () => clearTimeout(timer)
    }
  }, [deselectedVote])

  const updateContestChoicesScrollStates = useCallback(() => {
    const target = scrollContainer.current
    /* istanbul ignore next - `target` should aways exist, but sometimes it doesn't. Don't know how to create this condition in testing.  */
    if (!target) {
      return
    }
    const targetMinHeight = FONT_SIZES[context.userSettings.textSize] * 8 // magic number: room for buttons + spacing
    const windowsScrollTopOffsetMagicNumber = 1 // Windows Chrome is often 1px when using scroll buttons.
    const windowsScrollTop = Math.ceil(target.scrollTop) // Windows Chrome scrolls to sub-pixel values.
    setIsScrollable(
      /* istanbul ignore next: Tested by Cypress */
      target.scrollHeight > target.offsetHeight &&
        /* istanbul ignore next: Tested by Cypress */
        target.offsetHeight > targetMinHeight
    )
    setIsScrollAtBottom(
      windowsScrollTop +
        target.offsetHeight +
        windowsScrollTopOffsetMagicNumber >= // Windows Chrome "gte" check.
        target.scrollHeight
    )
    setIsScrollAtTop(target.scrollTop === 0)
  }, [scrollContainer, context.userSettings.textSize])

  const voteLength = vote?.length
  useEffect(() => {
    updateContestChoicesScrollStates()
    window.addEventListener('resize', updateContestChoicesScrollStates)
    return () => {
      window.removeEventListener('resize', updateContestChoicesScrollStates)
    }
  }, [voteLength, updateContestChoicesScrollStates])

  const handleUpdateSelection: EventTargetFunction = (event) => {
    const newVote = (event.currentTarget as HTMLInputElement).dataset
      .choice as YesOrNo
    if ((vote as string[] | undefined)?.includes(newVote)) {
      updateVote(contest.id, undefined)
      setDeselectedVote(newVote)
    } else {
      updateVote(contest.id, [newVote] as YesNoVote)
    }
  }

  const handleChangeVoteAlert = (newValue: YesOrNo) => {
    setOvervoteSelection(newValue)
  }

  const scrollContestChoices: EventTargetFunction /* istanbul ignore next: Tested by Cypress */ = (
    event
  ) => {
    const direction = (event.target as HTMLElement).dataset
      .direction as ScrollDirections
    const sc = scrollContainer.current!
    const currentScrollTop = sc.scrollTop
    const { offsetHeight } = sc
    const { scrollHeight } = sc
    const idealScrollDistance = Math.round(offsetHeight * 0.75)
    const maxScrollableDownDistance =
      scrollHeight - offsetHeight - currentScrollTop
    const maxScrollTop =
      direction === 'down'
        ? currentScrollTop + maxScrollableDownDistance
        : currentScrollTop
    const idealScrollTop =
      direction === 'down'
        ? currentScrollTop + idealScrollDistance
        : currentScrollTop - idealScrollDistance
    const top = idealScrollTop > maxScrollTop ? maxScrollTop : idealScrollTop
    sc.scrollTo({ behavior: 'smooth', left: 0, top })
  }

  const closeOvervoteAlert = () => {
    setOvervoteSelection(undefined)
  }

  return (
    <React.Fragment>
      <Main>
        <ContentHeader id="contest-header">
          <Prose id="audiofocus">
            <h1 aria-label={`${contest.title}.`}>
              <ContestSection>{contest.section}</ContestSection>
              {contest.title}
            </h1>
            <p>
              <strong>Vote Yes or No.</strong>
              <span className="screen-reader-only">
                To navigate through the contest choices, use the down button. To
                move to the next contest, use the right button.
              </span>
            </p>
          </Prose>
        </ContentHeader>
        <VariableContentContainer
          showTopShadow={!isScrollAtTop}
          showBottomShadow={!isScrollAtBottom}
        >
          <ScrollContainer
            ref={scrollContainer}
            onScroll={updateContestChoicesScrollStates}
          >
            <ScrollableContentWrapper isScrollable={isScrollable}>
              <Prose>
                <TextWithLineBreaks text={contest.description} />
              </Prose>
            </ScrollableContentWrapper>
          </ScrollContainer>
          {isScrollable /* istanbul ignore next: Tested by Cypress */ && (
            <ScrollControls aria-hidden>
              <Button
                className="scroll-up"
                big
                primary
                aria-hidden
                data-direction="up"
                disabled={isScrollAtTop}
                onPress={scrollContestChoices}
              >
                <span>See More</span>
              </Button>
              <Button
                className="scroll-down"
                big
                primary
                aria-hidden
                data-direction="down"
                disabled={isScrollAtBottom}
                onPress={scrollContestChoices}
              >
                <span>See More</span>
              </Button>
            </ScrollControls>
          )}
        </VariableContentContainer>
        <ContestFooter>
          <ChoicesGrid data-testid="contest-choices">
            {[
              { label: 'Yes', vote: 'yes' } as const,
              { label: 'No', vote: 'no' } as const,
            ].map((answer) => {
              const isChecked = getSingleYesNoVote(vote) === answer.vote
              const isDisabled = !isChecked && !!vote
              const handleDisabledClick = () => {
                handleChangeVoteAlert(answer.vote)
              }
              let prefixAudioText = ''
              if (isChecked) {
                prefixAudioText = 'Selected,'
              } else if (deselectedVote === answer.vote) {
                prefixAudioText = 'Deselected,'
              }
              return (
                <ChoiceButton
                  key={answer.vote}
                  choice={answer.vote}
                  isSelected={isChecked}
                  onPress={
                    isDisabled ? handleDisabledClick : handleUpdateSelection
                  }
                >
                  <Prose>
                    <Text
                      aria-label={`${prefixAudioText} ${answer.label} on ${
                        contest.shortTitle ?? contest.title
                      }`}
                      wordBreak
                    >
                      {answer.label}
                    </Text>
                  </Prose>
                </ChoiceButton>
              )
            })}
          </ChoicesGrid>
        </ContestFooter>
      </Main>
      <Modal
        isOpen={!!overvoteSelection}
        centerContent
        content={
          <Prose>
            {overvoteSelection && (
              <p id="modalaudiofocus">
                Do you want to change your vote to{' '}
                <strong>{YES_NO_VOTES[overvoteSelection]}</strong>? To change
                your vote, first unselect your vote for{' '}
                <strong>
                  {
                    {
                      no: YES_NO_VOTES.yes,
                      yes: YES_NO_VOTES.no,
                    }[overvoteSelection]
                  }
                </strong>
                .
              </p>
            )}
          </Prose>
        }
        actions={
          <Button primary autoFocus onPress={closeOvervoteAlert}>
            Okay
          </Button>
        }
      />
    </React.Fragment>
  )
}

export default YesNoContest
