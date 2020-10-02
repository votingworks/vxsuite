import React, {
  PointerEventHandler,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import styled from 'styled-components'

import {
  YesNoVote,
  MsEitherNeitherContest as MsEitherNeitherContestInterface,
  OptionalYesNoVote,
} from '@votingworks/ballot-encoder'

import { ScrollDirections, UpdateVoteFunction } from '../config/types'

import { FONT_SIZES } from '../config/globals'

import Main from './Main'
import ChoiceButton from './ChoiceButton'
import Prose from './Prose'
import Button from './Button'
import Text, { TextWithLineBreaks } from './Text'
import {
  ContentHeader,
  ContestSection,
  VariableContentContainer,
  ScrollControls,
  ScrollContainer,
  ScrollableContentWrapper,
} from './ContestScreenLayout'
import BallotContext from '../contexts/ballotContext'

const ChoicesGrid = styled.div`
  display: grid;
  grid-auto-rows: minmax(auto, 1fr);
  grid-gap: 1rem;
  grid-template-areas:
    'either-neither-label divider pick-one-label'
    'either-option divider first-option'
    'neither-option divider second-option';
  grid-template-columns: 1fr calc(2rem + 1px) 1fr;
  grid-template-rows: auto;
  padding: 1rem 2rem;
`
const GridLabel = styled.div`
  display: flex;
  align-items: flex-end;
`
const Divider = styled.div`
  display: flex;
  grid-area: divider;
  justify-content: center;
  &::before {
    background: #000000;
    width: 2px;
    content: '';
  }
`

interface Props {
  contest: MsEitherNeitherContestInterface
  eitherNeitherContestVote: OptionalYesNoVote
  pickOneContestVote: OptionalYesNoVote
  updateVote: UpdateVoteFunction
}

const MsEitherNeitherContest = ({
  contest,
  eitherNeitherContestVote,
  pickOneContestVote,
  updateVote,
}: Props) => {
  const { userSettings } = useContext(BallotContext)
  const scrollContainer = useRef<HTMLDivElement>(null) // eslint-disable-line no-restricted-syntax
  const [isScrollable, setIsScrollable] = useState(true)
  const [isScrollAtTop, setIsScrollAtTop] = useState(true)
  const [isScrollAtBottom, setIsScrollAtBottom] = useState(true)
  const showTopShadow = true
  const showBottomShadow = true

  const handleUpdateEitherNeither = (
    event: React.MouseEvent<HTMLInputElement>
  ) => {
    const currentVote = eitherNeitherContestVote?.[0]
    const targetVote = event.currentTarget.dataset.choice
    const newVote = currentVote === targetVote ? [] : [targetVote]
    updateVote(contest.eitherNeitherContestId, newVote as YesNoVote)
  }
  const handleUpdatePickOne = (event: React.MouseEvent<HTMLInputElement>) => {
    const currentVote = pickOneContestVote?.[0]
    const targetVote = event.currentTarget.dataset.choice
    const newVote = currentVote === targetVote ? [] : [targetVote]
    updateVote(contest.pickOneContestId, newVote as YesNoVote)
  }

  const updateContestChoicesScrollStates = useCallback(() => {
    const target = scrollContainer.current
    /* istanbul ignore next - `target` should aways exist, but sometimes it doesn't. Don't know how to create this condition in testing.  */
    if (!target) {
      return
    }
    const targetMinHeight = FONT_SIZES[userSettings.textSize] * 8 // magic number: room for buttons + spacing
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
  }, [userSettings.textSize])

  const scrollContestChoices: PointerEventHandler = /* istanbul ignore next: Tested by Cypress */ (
    event
  ) => {
    const direction = (event.target as HTMLElement).dataset
      .direction as ScrollDirections
    const sc = scrollContainer.current!
    const currentScrollTop = sc.scrollTop
    const offsetHeight = sc.offsetHeight
    const scrollHeight = sc.scrollHeight
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
    sc.scrollTo({
      behavior: 'smooth',
      left: 0,
      top,
    })
  }

  useEffect(() => {
    updateContestChoicesScrollStates()
    window.addEventListener('resize', updateContestChoicesScrollStates)
    return () => {
      window.removeEventListener('resize', updateContestChoicesScrollStates)
    }
  }, [updateContestChoicesScrollStates])

  useEffect(() => {
    updateContestChoicesScrollStates()
  }, [
    eitherNeitherContestVote,
    pickOneContestVote,
    updateContestChoicesScrollStates,
  ])

  const eitherNeitherVote = eitherNeitherContestVote?.[0]
  const forEither = '“for either”'
  const againstBoth = '“against both”'
  const eitherLabel = eitherNeitherVote === 'yes' ? forEither : againstBoth
  const pickOneVote = pickOneContestVote?.[0]

  return (
    <React.Fragment>
      <Main>
        <ContentHeader>
          <Prose>
            <h1 aria-label={`${contest.title}.`}>
              <ContestSection>{contest.section}</ContestSection>
              {contest.title}
            </h1>
            <p>
              {eitherNeitherVote && pickOneVote ? (
                <span>
                  You have selected {eitherLabel} and your preferred measure.
                </span>
              ) : eitherNeitherVote && !pickOneVote ? (
                <span>
                  You have selected {eitherLabel}.{' '}
                  {eitherNeitherVote === 'yes' ? (
                    <strong>Now select your preferred measure.</strong>
                  ) : (
                    <strong>
                      You may additionally select your preferred measure.
                    </strong>
                  )}
                </span>
              ) : !eitherNeitherVote && pickOneVote ? (
                <span>
                  You have selected your preferred measure.{' '}
                  <strong>
                    Now vote {forEither} or {againstBoth}.
                  </strong>
                </span>
              ) : (
                <span>
                  First vote {forEither} or {againstBoth}. Then select your
                  preferred measure.
                </span>
              )}
              <span className="screen-reader-only">
                To navigate through the contest choices, use the down button. To
                move to the next contest, use the right button.
              </span>
            </p>
          </Prose>
        </ContentHeader>
        <VariableContentContainer
          showTopShadow={showTopShadow}
          showBottomShadow={showBottomShadow}
        >
          <ScrollContainer
            ref={scrollContainer}
            onScroll={updateContestChoicesScrollStates}
          >
            <ScrollableContentWrapper isScrollable={isScrollable}>
              <Prose>
                <TextWithLineBreaks
                  style={{
                    fontSize: '0.95rem',
                  }}
                  text={contest.description}
                />
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
        <ChoicesGrid>
          <GridLabel
            style={{
              gridArea: 'either-neither-label',
            }}
          >
            <Prose>
              <Text
                small
                bold
                style={{
                  fontSize: '0.7rem',
                }}
              >
                {contest.eitherNeitherLabel}
              </Text>
            </Prose>
          </GridLabel>
          <ChoiceButton
            choice="yes"
            isSelected={eitherNeitherContestVote?.[0] === 'yes'}
            onPress={handleUpdateEitherNeither}
            style={{
              gridArea: 'either-option',
            }}
          >
            <Prose>
              <Text>{contest.eitherOption.label}</Text>
            </Prose>
          </ChoiceButton>
          <ChoiceButton
            choice="no"
            isSelected={eitherNeitherContestVote?.[0] === 'no'}
            onPress={handleUpdateEitherNeither}
            style={{
              gridArea: 'neither-option',
            }}
          >
            <Prose>
              <Text>{contest.neitherOption.label}</Text>
            </Prose>
          </ChoiceButton>
          <GridLabel
            style={{
              gridArea: 'pick-one-label',
            }}
          >
            <Prose>
              <Text
                small
                bold
                style={{
                  fontSize: '0.7rem',
                }}
              >
                {contest.pickOneLabel}
              </Text>
            </Prose>
          </GridLabel>
          <ChoiceButton
            choice="yes"
            isSelected={pickOneContestVote?.[0] === 'yes'}
            onPress={handleUpdatePickOne}
            style={{
              gridArea: 'first-option',
            }}
          >
            <Prose>
              <Text>{contest.firstOption.label}</Text>
            </Prose>
          </ChoiceButton>
          <ChoiceButton
            choice="no"
            isSelected={pickOneContestVote?.[0] === 'no'}
            onPress={handleUpdatePickOne}
            style={{
              gridArea: 'second-option',
            }}
          >
            <Prose>
              <Text>{contest.secondOption.label}</Text>
            </Prose>
          </ChoiceButton>
          <Divider />
        </ChoicesGrid>
      </Main>
    </React.Fragment>
  )
}

export default MsEitherNeitherContest
