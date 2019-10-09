import camelCase from 'lodash.camelcase'
import React, { PointerEventHandler } from 'react'
import styled from 'styled-components'

import { findPartyById } from '../utils/find'
import stripQuotes from '../utils/stripQuotes'

import {
  Candidate,
  CandidateContest as CandidateContestInterface,
  CandidateVote,
  EventTargetFunction,
  OptionalCandidate,
  Parties,
  Scrollable,
  ScrollDirections,
  ScrollShadows,
  UpdateVoteFunction,
} from '../config/types'

import BallotContext from '../contexts/ballotContext'

import { FONT_SIZES } from '../config/globals'
import ChoiceButton from './ChoiceButton'
import Button from './Button'
import Main from './Main'
import Modal from './Modal'
import Prose from './Prose'
import Text from './Text'
import VirtualKeyboard from './VirtualKeyboard'

const ContentHeader = styled.div`
  margin: 0 auto;
  width: 100%;
  padding: 1rem 5rem 0.5rem 9rem;
`
const ContestSection = styled.div`
  text-transform: uppercase;
  font-size: 0.85rem;
  font-weight: 600;
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

const WriteInCandidateForm = styled.div`
  margin: 1rem 0 -1rem;
  border-radius: 0.25rem;
  background-color: rgb(211, 211, 211);
  padding: 0.25rem;
`

const WriteInCandidateFieldSet = styled.fieldset`
  margin: 0.5rem 0.5rem 1rem;
`

const WriteInCandidateInput = styled.input.attrs({
  readOnly: true,
  type: 'text',
})`
  outline: none;
  border: 1px solid rgb(169, 169, 169);
  box-shadow: 0 0 3px -1px rgba(0, 0, 0, 0.3);
  width: 100%;
  padding: 0.25rem 0.35rem;
`

interface Props {
  contest: CandidateContestInterface
  parties: Parties
  vote: CandidateVote
  updateVote: UpdateVoteFunction
}

interface State {
  attemptedOvervoteCandidate: OptionalCandidate
  candidatePendingRemoval: OptionalCandidate
  isScrollAtBottom: boolean
  isScrollAtTop: boolean
  isScrollable: boolean
  writeInCandateModalIsOpen: boolean
  writeInCandidateName: string
}

const initialState = {
  attemptedOvervoteCandidate: undefined,
  candidatePendingRemoval: undefined,
  isScrollable: false,
  isScrollAtBottom: true,
  isScrollAtTop: true,
  writeInCandateModalIsOpen: false,
  writeInCandidateName: '',
}

class CandidateContest extends React.Component<Props, State> {
  public context!: React.ContextType<typeof BallotContext>
  public state: State = initialState
  private scrollContainer = React.createRef<HTMLDivElement>()

  public componentDidMount() {
    this.updateContestChoicesScrollStates()
    window.addEventListener('resize', this.updateContestChoicesScrollStates)
  }

  public componentDidUpdate(prevProps: Props) {
    /* istanbul ignore else */
    if (this.props.vote.length !== prevProps.vote.length) {
      this.updateContestChoicesScrollStates()
    }
  }

  public componentWillUnmount = () => {
    window.removeEventListener('resize', this.updateContestChoicesScrollStates)
  }

  public findCandidateById = (candidates: Candidate[], id: string) =>
    candidates.find(c => c.id === id)

  public addCandidateToVote = (id: string) => {
    const { contest, vote } = this.props
    const { candidates } = contest
    const candidate = this.findCandidateById(candidates, id)!
    this.props.updateVote(contest.id, [...vote, candidate])
  }

  public removeCandidateFromVote = (id: string) => {
    const { contest, vote } = this.props
    const newVote = vote.filter(c => c.id !== id)
    this.props.updateVote(contest.id, newVote)
  }

  public handleUpdateSelection: EventTargetFunction = event => {
    const { vote } = this.props
    const candidateId = (event.currentTarget as HTMLInputElement).dataset.choice
    /* istanbul ignore else */
    if (candidateId) {
      const candidate = this.findCandidateById(vote, candidateId)
      if (candidate) {
        if (candidate.isWriteIn) {
          this.setState({ candidatePendingRemoval: candidate })
        } else {
          this.removeCandidateFromVote(candidateId)
        }
      } else {
        this.addCandidateToVote(candidateId)
      }
    }
  }

  public handleChangeVoteAlert = (
    attemptedOvervoteCandidate: OptionalCandidate
  ) => {
    this.setState({ attemptedOvervoteCandidate })
  }

  public closeAttemptedVoteAlert = () => {
    // Delay to avoid passing tap to next screen
    window.setTimeout(() => {
      this.setState({ attemptedOvervoteCandidate: undefined })
    }, 200)
  }

  public confirmRemovePendingWriteInCandidate = () => {
    // Delay to avoid passing tap to next screen
    window.setTimeout(() => {
      this.removeCandidateFromVote(this.state.candidatePendingRemoval!.id)
    }, 200)
    this.clearCandidateIdPendingRemoval()
  }

  public clearCandidateIdPendingRemoval = () => {
    // Delay to avoid passing tap to next screen
    window.setTimeout(() => {
      this.setState({ candidatePendingRemoval: undefined })
    }, 200)
  }

  public initWriteInCandidate = () => {
    this.toggleWriteInCandidateModal(true)
  }

  public normalizeName = (name: string) =>
    name
      .trim()
      .replace(/\t+/g, ' ')
      .replace(/\s+/g, ' ')

  public addWriteInCandidate = () => {
    const { contest, vote } = this.props
    const normalizedCandidateName = this.normalizeName(
      this.state.writeInCandidateName
    )
    this.props.updateVote(contest.id, [
      ...vote,
      {
        id: `write-in__${camelCase(normalizedCandidateName)}`,
        isWriteIn: true,
        name: normalizedCandidateName,
      },
    ])
    this.setState({ writeInCandidateName: '' })

    // Delay to avoid passing tap to next screen
    window.setTimeout(() => {
      this.toggleWriteInCandidateModal(false)
    }, 200)
  }

  public cancelWriteInCandidateModal = () => {
    this.setState({ writeInCandidateName: '' })
    // Delay to avoid passing tap to next screen
    window.setTimeout(() => {
      this.toggleWriteInCandidateModal(false)
    }, 200)
  }

  public toggleWriteInCandidateModal = (writeInCandateModalIsOpen: boolean) => {
    this.setState({ writeInCandateModalIsOpen })
  }

  public onKeyboardInput: PointerEventHandler = event => {
    const { key } = (event.target as HTMLElement).dataset
    this.setState(prevState => {
      let writeInCandidateName = prevState.writeInCandidateName
      if (key === 'space') {
        writeInCandidateName += ' '
      } else if (key === '⌫ delete') {
        writeInCandidateName = writeInCandidateName.slice(0, -1)
      } else {
        writeInCandidateName += key
      }
      return { writeInCandidateName }
    })
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

  public scrollContestChoices: PointerEventHandler /* istanbul ignore next: Tested by Cypress */ = event => {
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
    scrollContainer.scrollTo({ behavior: 'smooth', left: 0, top })
  }

  public static contextType = BallotContext

  public render() {
    const { contest, parties, vote } = this.props
    const hasReachedMaxSelections = contest.seats === vote.length
    const {
      attemptedOvervoteCandidate,
      candidatePendingRemoval,
      isScrollable,
      isScrollAtBottom,
      isScrollAtTop,
      writeInCandidateName,
      writeInCandateModalIsOpen,
    } = this.state
    const maxWriteInCandidateLength = 40
    return (
      <React.Fragment>
        <Main>
          <ContentHeader id="contest-header">
            <Prose id="audiofocus">
              <h1 aria-label={`${contest.title}.`}>
                <ContestSection>{contest.section}</ContestSection>
                {contest.title}
              </h1>
              <p
                aria-label={`Vote for ${contest.seats}. You have selected ${vote.length}. Use the down arrow to hear your options. Use the right arrow to move to the next contest.`}
              >
                <Text as="span">Vote for {contest.seats}.</Text>{' '}
                {vote.length === contest.seats && (
                  <Text as="span" bold>
                    You have selected {contest.seats}.
                  </Text>
                )}
                {vote.length < contest.seats && vote.length !== 0 && (
                  <Text as="span" bold>
                    You may select {contest.seats - vote.length} more.
                  </Text>
                )}
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
                <ChoicesGrid>
                  {contest.candidates.map(candidate => {
                    const isChecked = !!this.findCandidateById(
                      vote,
                      candidate.id
                    )
                    const isDisabled = hasReachedMaxSelections && !isChecked
                    const handleDisabledClick = () => {
                      /* istanbul ignore else */
                      if (isDisabled) {
                        this.handleChangeVoteAlert(candidate)
                      }
                    }
                    const partyName = findPartyById(
                      parties,
                      candidate.partyId!
                    )!.name
                    return (
                      <ChoiceButton
                        key={candidate.id}
                        isSelected={isChecked}
                        onPress={
                          isDisabled
                            ? handleDisabledClick
                            : this.handleUpdateSelection
                        }
                        choice={candidate.id}
                        aria-label={`${
                          isChecked ? 'Selected, ' : ''
                        } ${stripQuotes(candidate.name)}, ${partyName}.`}
                      >
                        <Prose>
                          <Text wordBreak>
                            <strong>{candidate.name}</strong>
                            <br />
                            {partyName}
                          </Text>
                        </Prose>
                      </ChoiceButton>
                    )
                  })}
                  {contest.allowWriteIns &&
                    vote
                      .filter(c => c.isWriteIn)
                      .map(candidate => {
                        return (
                          <ChoiceButton
                            key={candidate.id}
                            isSelected
                            choice={candidate.id}
                            onPress={this.handleUpdateSelection}
                          >
                            <Prose>
                              <p
                                aria-label={`Selected, write-in: ${candidate.name}.`}
                              >
                                <strong>{candidate.name}</strong>
                              </p>
                            </Prose>
                          </ChoiceButton>
                        )
                      })}
                  {contest.allowWriteIns && !hasReachedMaxSelections && (
                    <ChoiceButton
                      choice="write-in"
                      isSelected={false}
                      onPress={this.initWriteInCandidate}
                    >
                      <Prose>
                        <p aria-label="add write-in candidate.">
                          <em>add write-in candidate</em>
                        </p>
                      </Prose>
                    </ChoiceButton>
                  )}
                </ChoicesGrid>
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
        </Main>
        <Modal
          isOpen={!!attemptedOvervoteCandidate}
          ariaLabel=""
          content={
            <Prose>
              <Text id="modalaudiofocus">
                You may only select {contest.seats}{' '}
                {contest.seats === 1 ? 'candidate' : 'candidates'} in this
                contest. To vote for{' '}
                {attemptedOvervoteCandidate && attemptedOvervoteCandidate.name},
                you must first unselect the selected{' '}
                {contest.seats === 1 ? 'candidate' : 'candidates'}.
                <span aria-label="Use the select button to continue." />
              </Text>
            </Prose>
          }
          actions={
            <Button
              primary
              autoFocus
              onPress={this.closeAttemptedVoteAlert}
              aria-label="use the select button to continue."
            >
              Okay
            </Button>
          }
        />
        <Modal
          isOpen={!!candidatePendingRemoval}
          content={
            <Prose>
              <Text>
                Do you want to unselect and remove{' '}
                {candidatePendingRemoval && candidatePendingRemoval.name}?
              </Text>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button
                danger
                onPress={this.confirmRemovePendingWriteInCandidate}
              >
                Yes, Remove.
              </Button>
              <Button onPress={this.clearCandidateIdPendingRemoval}>
                Cancel
              </Button>
            </React.Fragment>
          }
        />
        <Modal
          ariaLabel=""
          isOpen={writeInCandateModalIsOpen}
          content={
            <div>
              <Prose id="modalaudiofocus">
                <h2 aria-label="Write-In Candidate.">Write-In Candidate</h2>
                <Text aria-label="Enter the name of a person who is not on the ballot. Use the up and down arrows to navigate between the letters of a standard keyboard. Use the select button to select the current letter.">
                  Enter the name of a person who is <strong>not</strong> on the
                  ballot using the on-screen keyboard.
                </Text>
                {writeInCandidateName.length > 35 && (
                  <Text error>
                    <strong>Note:</strong> You have entered{' '}
                    {writeInCandidateName.length} of maximum{' '}
                    {maxWriteInCandidateLength} characters.
                  </Text>
                )}
              </Prose>
              <WriteInCandidateForm>
                <WriteInCandidateFieldSet>
                  <legend>
                    <label htmlFor="WriteInCandidateName">
                      <Prose>
                        <Text bold small>
                          {contest.title} (write-in)
                        </Text>
                      </Prose>
                    </label>
                  </legend>
                  <WriteInCandidateInput
                    id="WriteInCandidateName"
                    aria-label="Name of Write-in Candidate."
                    value={writeInCandidateName}
                    placeholder="candidate name"
                  />
                </WriteInCandidateFieldSet>
                <VirtualKeyboard onKeyPress={this.onKeyboardInput} />
              </WriteInCandidateForm>
            </div>
          }
          actions={
            <React.Fragment>
              <Button
                primary={this.normalizeName(writeInCandidateName).length > 0}
                onPress={this.addWriteInCandidate}
                disabled={this.normalizeName(writeInCandidateName).length === 0}
              >
                Accept
              </Button>
              <Button onPress={this.cancelWriteInCandidateModal}>Cancel</Button>
            </React.Fragment>
          }
        />
      </React.Fragment>
    )
  }
}

export default CandidateContest
