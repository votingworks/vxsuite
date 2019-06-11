import camelCase from 'lodash.camelcase'
import React, { PointerEventHandler } from 'react'
import styled from 'styled-components'

import { findPartyById } from '../utils/find'
import stripQuotes from '../utils/stripQuotes'

import {
  Candidate,
  CandidateContest as CandidateContestInterface,
  CandidateVote,
  InputEvent,
  OptionalCandidate,
  Parties,
  Scrollable,
  ScrollDirections,
  ScrollShadows,
  UpdateVoteFunction,
} from '../config/types'

import BallotContext from '../contexts/ballotContext'

import GLOBALS from '../config/globals'
import Button from './Button'
import Main from './Main'
import Modal from './Modal'
import Prose from './Prose'
import Text from './Text'
import VirtualKeyboard from './VirtualKeyboard'

const tabletMinWidth = 720

const ContentHeader = styled.div`
  margin: 0 auto;
  width: 100%;
  max-width: 35rem;
  padding: 1rem 0.75rem 0.5rem;
  @media (min-width: ${tabletMinWidth}px) {
    padding: 1rem 1.5rem 0.5rem;
    padding-left: 5rem;
  }
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
  display: none;
  flex-direction: column;
  justify-content: space-between;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  max-width: 35rem;
  padding: 0.5rem 0.75rem 0.5rem 0;
  padding-left: calc(100% - 7rem);
  pointer-events: none;
  & > * {
    pointer-events: auto;
  }
  html[data-useragent*='Windows'] & {
    margin-left: -17px; /* Windows Chrome scrollbar width */
  }
  @media (min-width: ${tabletMinWidth}px) {
    display: flex;
  }
  @media (min-width: 840px) {
    left: 50%;
    margin-left: -420px;
    padding-left: calc(840px - 7rem);
    html[data-useragent*='Windows'] & {
      margin-left: calc(-420px + -17px); /* Windows Chrome scrollbar width */
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
  max-width: 35rem;
  padding: 0.5rem 0.5rem 1rem;
  @media (min-width: ${tabletMinWidth}px) {
    padding-right: ${({ isScrollable }) =>
      isScrollable
        ? /* istanbul ignore next: Tested by Cypress */ '8rem'
        : '1rem'};
    padding-left: 1rem;
  }
`
const ChoicesGrid = styled.div`
  display: grid;
  grid-auto-rows: minmax(auto, 1fr);
  grid-gap: 1.25rem;
`
const Choice = styled('label')<{ isSelected: boolean }>`
  display: grid;
  align-items: center;
  position: relative;
  border-radius: 0.125rem;
  box-shadow: 0 0.125rem 0.125rem 0 rgba(0, 0, 0, 0.14),
    0 0.1875rem 0.0625rem -0.125rem rgba(0, 0, 0, 0.12),
    0 0.0625rem 0.3125rem 0 rgba(0, 0, 0, 0.2);
  background: ${({ isSelected }) => (isSelected ? '#028099' : '#FFFFFF')};
  cursor: pointer;
  color: ${({ isSelected }) => (isSelected ? '#FFFFFF' : undefined)};
  transition: background 0.25s, color 0.25s;
  button& {
    text-align: left;
  }
  :focus-within {
    outline: rgb(77, 144, 254) dashed 0.25rem;
  }
  ::before {
    display: flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    border-right: 1px solid;
    border-color: ${({ isSelected }) =>
      isSelected ? '#028099' : 'rgb(211, 211, 211)'};
    border-radius: 0.125rem 0 0 0.125rem;
    background: #FFFFFF;
    width: 3rem;
    text-align: center;
    color: #028099;
    font-size: 2rem;
    font-weight: 700;
    content: '${({ isSelected }) => (isSelected ? GLOBALS.CHECK_ICON : '')}';
  }
  & > div {
    padding: 0.5rem 0.5rem 0.5rem 4rem;
    @media (min-width: 480px) {
      padding: 1rem 1rem 1rem 4rem;
    }
  }
`
const ChoiceInput = styled.input.attrs({
  type: 'checkbox',
  role: 'option',
})`
  margin-right: 0.5rem;
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
  public static contextType = BallotContext
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

  public handleDisabledClick = () => {
    // maybe we'll do more when a disabled item is clicked, for now nothing.
  }

  public handleUpdateSelection = (event: InputEvent) => {
    const { vote } = this.props
    const id = (event.target as HTMLInputElement).value
    const candidate = this.findCandidateById(vote, id)
    if (candidate) {
      if (candidate.isWriteIn) {
        this.setState({ candidatePendingRemoval: candidate })
      } else {
        this.removeCandidateFromVote(id)
      }
    } else {
      this.addCandidateToVote(id)
    }
  }

  public handleChangeVoteAlert = (
    attemptedOvervoteCandidate: OptionalCandidate
  ) => {
    this.setState({ attemptedOvervoteCandidate })
  }

  public closeAttemptedVoteAlert = () => {
    this.setState({ attemptedOvervoteCandidate: undefined })
  }

  public confirmRemovePendingWriteInCandidate = () => {
    this.removeCandidateFromVote(this.state.candidatePendingRemoval!.id)
    this.clearCandidateIdPendingRemoval()
  }

  public clearCandidateIdPendingRemoval = () => {
    this.setState({ candidatePendingRemoval: undefined })
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
    this.toggleWriteInCandidateModal(false)
  }

  public cancelWriteInCandidateModal = () => {
    this.setState({ writeInCandidateName: '' })
    this.toggleWriteInCandidateModal(false)
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
    const isTabletMinWidth = target.offsetWidth >= tabletMinWidth
    const targetMinHeight =
      GLOBALS.FONT_SIZES[this.context.userSettings.textSize] * 8 // magic number: room for buttons + spacing
    const windowsScrollTopOffsetMagicNumber = 1 // Windows Chrome is often 1px when using scroll buttons.
    const windowsScrollTop = Math.ceil(target.scrollTop) // Windows Chrome scrolls to sub-pixel values.
    this.setState({
      isScrollable:
        isTabletMinWidth &&
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
        <Main noOverflow noPadding>
          <ContentHeader id="contest-header">
            <Prose id="audiofocus">
              <h1 aria-label={`${contest.title}.`}>
                <ContestSection>{contest.section}</ContestSection>
                {contest.title}
              </h1>
              <p
                aria-label={`Vote for ${contest.seats}. You have selected ${
                  vote.length
                }. Use the down arrow to hear your options. Use the right arrow to move to the next contest.`}
              >
                <strong>Vote for {contest.seats}.</strong> You have selected{' '}
                {vote.length}.
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
                      if (isDisabled) {
                        this.handleChangeVoteAlert(candidate)
                      }
                    }
                    const party =
                      candidate.partyId &&
                      findPartyById(parties, candidate.partyId)
                    return (
                      <Choice
                        key={candidate.id}
                        htmlFor={candidate.id}
                        isSelected={isChecked}
                        onPointerUp={handleDisabledClick}
                        aria-label={`${stripQuotes(candidate.name)}, ${
                          party ? party.name : ''
                        }.`}
                      >
                        <ChoiceInput
                          id={candidate.id}
                          name={candidate.name}
                          value={candidate.id}
                          onChange={
                            isDisabled
                              ? this.handleDisabledClick
                              : this.handleUpdateSelection
                          }
                          checked={isChecked}
                          className="visually-hidden"
                        />
                        <Prose>
                          <Text wordBreak>
                            <strong>{candidate.name}</strong>
                            <br />
                            {party ? party.name : ''}
                          </Text>
                        </Prose>
                      </Choice>
                    )
                  })}
                  {contest.allowWriteIns &&
                    vote
                      .filter(c => c.isWriteIn)
                      .map(candidate => {
                        return (
                          <Choice
                            key={candidate.id}
                            htmlFor={candidate.id}
                            isSelected
                          >
                            <ChoiceInput
                              id={candidate.id}
                              name={contest.id}
                              value={candidate.id}
                              onChange={this.handleUpdateSelection}
                              checked
                              className="visually-hidden"
                            />
                            <Prose>
                              <p aria-label={`${candidate.name}.`}>
                                <strong>{candidate.name}</strong>
                              </p>
                            </Prose>
                          </Choice>
                        )
                      })}
                  {contest.allowWriteIns && !hasReachedMaxSelections && (
                    <Choice
                      isSelected={false}
                      onPointerUp={this.initWriteInCandidate}
                    >
                      <ChoiceInput className="visually-hidden" />
                      <Prose>
                        <p aria-label="add write-in candidate.">
                          <em>add write-in candidate</em>
                        </p>
                      </Prose>
                    </Choice>
                  )}
                </ChoicesGrid>
              </ScrollableContentWrapper>
            </ScrollContainer>
            {isScrollable /* istanbul ignore next: Tested by Cypress */ && (
              <ScrollControls aria-hidden="true">
                <Button
                  aria-hidden
                  data-direction="up"
                  disabled={isScrollAtTop}
                  onPress={this.scrollContestChoices}
                >
                  ↑ See More
                </Button>
                <Button
                  aria-hidden
                  data-direction="down"
                  disabled={isScrollAtBottom}
                  onPress={this.scrollContestChoices}
                >
                  ↓ See More
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
                you must first unselect selected{' '}
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
            <>
              <Button
                danger
                onPress={this.confirmRemovePendingWriteInCandidate}
              >
                Yes, Remove.
              </Button>
              <Button onPress={this.clearCandidateIdPendingRemoval}>
                Cancel
              </Button>
            </>
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
            <>
              <Button
                primary={this.normalizeName(writeInCandidateName).length > 0}
                onPress={this.addWriteInCandidate}
                disabled={this.normalizeName(writeInCandidateName).length === 0}
              >
                Accept
              </Button>
              <Button onPress={this.cancelWriteInCandidateModal}>Cancel</Button>
            </>
          }
        />
      </React.Fragment>
    )
  }
}

export default CandidateContest
