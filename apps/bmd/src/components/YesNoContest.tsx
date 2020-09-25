import React, { PointerEventHandler } from 'react'
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

interface State {
  isScrollable: boolean
  isScrollAtBottom: boolean
  isScrollAtTop: boolean
  overvoteSelection: Optional<YesOrNo>
}

const initialState: State = {
  isScrollable: false,
  isScrollAtBottom: true,
  isScrollAtTop: true,
  overvoteSelection: undefined,
}

export default class YesNoContest extends React.Component<Props, State> {
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

  public handleUpdateSelection: EventTargetFunction = (event) => {
    const { vote } = this.props
    const newVote = (event.currentTarget as HTMLInputElement).dataset
      .choice as YesOrNo
    if ((vote as string[] | undefined)?.includes(newVote)) {
      this.props.updateVote(this.props.contest.id, undefined)
    } else {
      this.props.updateVote(this.props.contest.id, [newVote] as YesNoVote)
    }
  }

  public handleChangeVoteAlert = (overvoteSelection: YesOrNo) => {
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

  public scrollContestChoices: PointerEventHandler = /* istanbul ignore next: Tested by Cypress */ (
    event
  ) => {
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
    this.setState({ overvoteSelection: initialState.overvoteSelection })
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
              <p>
                <strong>Vote Yes or No.</strong>
                <span className="screen-reader-only">
                  To navigate through the contest choices, use the down button.
                  To move to the next contest, use the right button.
                </span>
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
              {[
                { label: 'Yes', vote: 'yes' } as const,
                { label: 'No', vote: 'no' } as const,
              ].map((answer) => {
                const isChecked = getSingleYesNoVote(vote) === answer.vote
                const isDisabled = !isChecked && !!vote
                const handleDisabledClick = () => {
                  this.handleChangeVoteAlert(answer.vote)
                }
                return (
                  <ChoiceButton
                    key={answer.vote}
                    choice={answer.vote}
                    isSelected={isChecked}
                    onPress={
                      isDisabled
                        ? handleDisabledClick
                        : this.handleUpdateSelection
                    }
                  >
                    <Prose>
                      <Text
                        aria-label={`${isChecked ? 'Selected, ' : ''} ${
                          answer.label
                        } on ${contest.shortTitle ?? contest.title}`}
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
            <Button primary autoFocus onPress={this.closeOvervoteAlert}>
              Okay
            </Button>
          }
        />
      </React.Fragment>
    )
  }
}
