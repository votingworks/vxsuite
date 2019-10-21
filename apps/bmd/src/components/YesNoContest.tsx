import React, { PointerEventHandler } from 'react'
import styled from 'styled-components'
import {
  YesNoVote,
  OptionalYesNoVote,
  YesNoContest as YesNoContestInterface,
} from '@votingworks/ballot-encoder'

import {
  EventTargetFunction,
  Scrollable,
  ScrollDirections,
  ScrollShadows,
  UpdateVoteFunction,
} from '../config/types'

import BallotContext from '../contexts/ballotContext'

import { FONT_SIZES, YES_NO_VOTES } from '../config/globals'
import ChoiceButton from './ChoiceButton'
import Button from './Button'
import Main from './Main'
import Modal from './Modal'
import Prose from './Prose'
import Text, { TextWithLineBreaks } from './Text'

const ContentHeader = styled.div`
  margin: 0 auto;
  width: 100%;
  padding: 1rem 5rem 0.5rem;
`
const ContestSection = styled.div`
  text-transform: uppercase;
  font-size: 0.85rem;
  font-weight: 600;
`
const ContestFooter = styled.div`
  margin: 0 auto;
  width: 100%;
  padding: 1rem 5rem;
`
const VariableContentContainer = styled.div<ScrollShadows>`
  display: flex;
  flex: 1;
  position: relative;
  overflow: auto;
  &::before,
  &::after {
    position: absolute;
    z-index: 1;
    width: 100%;
    height: 0.25rem;
    content: '';
    transition: opacity 0.25s ease;
  }
  &::before {
    top: 0;
    opacity: ${({ showTopShadow }) =>
      showTopShadow ? /* istanbul ignore next: Tested by Cypress */ 1 : 0};
    background: linear-gradient(
      to bottom,
      rgb(177, 186, 190) 0%,
      transparent 100%
    );
  }
  &::after {
    bottom: 0;
    opacity: ${({ showBottomShadow }) =>
      showBottomShadow ? /* istanbul ignore next: Tested by Cypress */ 1 : 0};
    background: linear-gradient(
      to bottom,
      transparent 0%,
      rgb(177, 186, 190) 100%
    );
  }
`
const ScrollControls = styled.div`
  z-index: 2;
  & > button {
    position: absolute;
    right: 1.5rem;
    transform: opacity 1s linear;
    visibility: visible;
    opacity: 1;
    outline: none;
    box-shadow: 0 0 10px 3px rgba(0, 0, 0, 0.3);
    width: 8rem;
    height: 5rem;
    padding: 0;
    font-weight: 700;
    transition: visibility 0s linear 0s, opacity 500ms;
    &[disabled] {
      visibility: hidden;
      opacity: 0;
      transition: visibility 0s linear 500ms, opacity 500ms;
      pointer-events: none;
    }
    & > span {
      position: relative;
      pointer-events: none;
    }
    &::before {
      position: absolute;
      left: 50%;
      margin-left: -1rem;
      width: 2rem;
      height: 2rem;
      content: '';
    }
    &:first-child {
      top: 0;
      border-radius: 0 0 4rem 4rem;
      & > span {
        top: -1.25rem;
      }
      &::before {
        bottom: 0.75rem;
        background: url('/images/arrow-up.svg') no-repeat;
      }
    }
    &:last-child {
      bottom: 0;
      border-radius: 4rem 4rem 0 0;
      & > span {
        top: 1.25rem;
      }
      &::before {
        top: 0.75rem;
        background: url('/images/arrow-down.svg') no-repeat;
      }
    }
  }
`
const ScrollContainer = styled.div`
  flex: 1;
  overflow: auto;
`
const ScrollableContentWrapper = styled.div<Scrollable>`
  margin: 0 auto;
  width: 100%;
  padding: 0.5rem 5rem 2rem;
  padding-right: ${({ isScrollable }) =>
    isScrollable
      ? /* istanbul ignore next: Tested by Cypress */ '11rem'
      : undefined};
`
const ChoicesGrid = styled.div`
  display: grid;
  grid-auto-rows: minmax(auto, 1fr);
  grid-gap: 1rem;
`

interface Props {
  contest: YesNoContestInterface
  vote: OptionalYesNoVote
  updateVote: UpdateVoteFunction
}

interface State {
  isScrollable: boolean
  isScrollAtBottom: boolean
  isScrollAtTop: boolean
  overvoteSelection: OptionalYesNoVote
}

const initialState: State = {
  isScrollable: false,
  isScrollAtBottom: true,
  isScrollAtTop: true,
  overvoteSelection: undefined,
}

export default class YesNoContest extends React.Component<Props> {
  public context!: React.ContextType<typeof BallotContext>
  public state = initialState
  private scrollContainer = React.createRef<HTMLDivElement>()

  public componentDidMount() {
    this.updateContestChoicesScrollStates()
    window.addEventListener('resize', this.updateContestChoicesScrollStates)
  }

  public componentDidUpdate(prevProps: Props) {
    if (this.props.vote !== prevProps.vote) {
      this.updateContestChoicesScrollStates()
    }
  }

  public handleUpdateSelection: EventTargetFunction = event => {
    const { vote } = this.props
    const newVote = (event.currentTarget as HTMLInputElement).dataset
      .choice as YesNoVote
    if (vote === newVote) {
      this.props.updateVote(this.props.contest.id, undefined)
    } else {
      this.props.updateVote(this.props.contest.id, newVote)
    }
  }

  public handleChangeVoteAlert = (overvoteSelection: YesNoVote) => {
    this.setState({ overvoteSelection })
  }

  public updateContestChoicesScrollStates = () => {
    const target = this.scrollContainer.current
    /* istanbul ignore next - `target` should aways exist, but sometimes it doesn't. Don't know how to create this condition in testing.  */
    if (!target) {
      return
    }
    const targetMinHeight = FONT_SIZES[this.context.userSettings.textSize] * 8 // magic number: room for buttons + spacing
    const windowsScrollTopOffsetMagicNumber = 1 // Windows Chrome is often 1px when using scroll buttons.
    const windowsScrollTop = Math.ceil(target.scrollTop) // Windows Chrome scrolls to sub-pixel values.
    this.setState({
      isScrollable:
        /* istanbul ignore next: Tested by Cypress */
        target.scrollHeight > target.offsetHeight &&
        /* istanbul ignore next: Tested by Cypress */
        target.offsetHeight > targetMinHeight,
      isScrollAtBottom:
        windowsScrollTop +
          target.offsetHeight +
          windowsScrollTopOffsetMagicNumber >= // Windows Chrome "gte" check.
        target.scrollHeight,
      isScrollAtTop: target.scrollTop === 0,
    })
  }

  public scrollContestChoices: PointerEventHandler = /* istanbul ignore next: Tested by Cypress */ event => {
    const direction = (event.target as HTMLElement).dataset
      .direction as ScrollDirections
    const scrollContainer = this.scrollContainer.current!
    const currentScrollTop = scrollContainer.scrollTop
    const offsetHeight = scrollContainer.offsetHeight
    const scrollHeight = scrollContainer.scrollHeight
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
    scrollContainer.scrollTo({
      behavior: 'smooth',
      left: 0,
      top,
    })
  }

  public closeOvervoteAlert = () => {
    // Delay to avoid passing tap to next screen
    window.setTimeout(() => {
      this.setState({ overvoteSelection: initialState.overvoteSelection })
    }, 200)
  }

  public static contextType = BallotContext

  public render() {
    const { contest, vote } = this.props
    const { overvoteSelection } = this.state
    const { isScrollable, isScrollAtBottom, isScrollAtTop } = this.state
    return (
      <React.Fragment>
        <Main>
          <ContentHeader id="contest-header">
            <Prose id="audiofocus">
              <h1 aria-label={`${contest.title}.`}>
                <ContestSection>{contest.section}</ContestSection>
                {contest.title}
              </h1>
              <p aria-label="Vote Yes or No. Use the down arrow to select your preference. Use the right arrow to move to the next contest.">
                <strong>Vote Yes or No.</strong>
              </p>
            </Prose>
          </ContentHeader>
          <VariableContentContainer
            showTopShadow={!isScrollAtTop}
            showBottomShadow={!isScrollAtBottom}
          >
            <ScrollContainer
              ref={this.scrollContainer}
              onScroll={this.updateContestChoicesScrollStates}
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
                  onPress={this.scrollContestChoices}
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
                  onPress={this.scrollContestChoices}
                >
                  <span>See More</span>
                </Button>
              </ScrollControls>
            )}
          </VariableContentContainer>
          <ContestFooter>
            <ChoicesGrid data-testid="contest-choices">
              {['Yes', 'No'].map(answer => {
                const answerLowerCase = answer.toLowerCase()
                const isChecked = vote === answerLowerCase
                const isDisabled = !isChecked && !!vote
                const handleDisabledClick = () => {
                  this.handleChangeVoteAlert(answer.toLowerCase() as YesNoVote)
                }
                return (
                  <ChoiceButton
                    key={answer}
                    choice={answerLowerCase}
                    isSelected={isChecked}
                    onPress={
                      isDisabled
                        ? handleDisabledClick
                        : this.handleUpdateSelection
                    }
                  >
                    <Prose>
                      <Text
                        aria-label={`${
                          isChecked ? 'Selected, ' : ''
                        } ${answer} on ${contest.shortTitle || contest.title}`}
                        wordBreak
                      >
                        {answer}
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
                <p>
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
            <Button primary autoFocus onPress={this.closeOvervoteAlert}>
              Okay
            </Button>
          }
        />
      </React.Fragment>
    )
  }
}
