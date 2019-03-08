import camelCase from 'lodash.camelcase'
import React from 'react'
import styled from 'styled-components'
import {
  Candidate,
  CandidateContest as CandidateContestInterface,
  CandidateVote,
  InputEvent,
  OptionalCandidate,
  UpdateVoteFunction,
} from '../config/types'

import Keyboard from 'react-simple-keyboard'
import 'react-simple-keyboard/build/css/index.css'

import Button from './Button'
import Modal from './Modal'
import Prose from './Prose'
import { Text } from './Typography'

const ContestSection = styled.small`
  font-weight: 600;
  text-transform: uppercase;
`
const FieldSet = styled.fieldset``
const Legend = styled.legend`
  margin: 0 0.25rem 1rem;
  @media (min-width: 480px) {
    margin: 0 1rem 1rem;
    margin-left: 4rem;
  }
`
const Choices = styled.div`
  display: grid;
  grid-auto-rows: minmax(auto, 1fr);
  grid-gap: 0.75rem;
`
const Choice = styled('label')<{ isSelected: boolean }>`
  cursor: pointer;
  position: relative;
  display: grid;
  align-items: center;
  border-radius: 0.125rem;
  background: ${({ isSelected }) => (isSelected ? '#028099' : 'white')};
  color: ${({ isSelected }) => (isSelected ? 'white' : undefined)};
  box-shadow: 0 0.125rem 0.125rem 0 rgba(0, 0, 0, 0.14),
    0 0.1875rem 0.0625rem -0.125rem rgba(0, 0, 0, 0.12),
    0 0.0625rem 0.3125rem 0 rgba(0, 0, 0, 0.2);
  transition: background 0.25s, color 0.25s;
  button& {
    text-align: left;
  }
  :focus-within {
    outline: -webkit-focus-ring-color auto 5px;
  }
  :before {
    content: '${({ isSelected }) => (isSelected ? '✓' : '')}';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: white;
    border-right: 1px solid;
    border-color: ${({ isSelected }) => (isSelected ? '#028099' : 'lightgrey')};
    width: 3rem;
    text-align: center;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 2rem;
    border-radius: 0.125rem 0 0 0.125rem;
    color: #028099;
  }
  & > div {
    word-break: break-word;
    padding: 0.5rem 0.5rem 0.5rem 4rem;
    @media (min-width: 480px) {
      padding: 1rem 1rem 1rem inherit;
    }
  }
`
const ChoiceInput = styled.input.attrs({
  type: 'checkbox',
})`
  margin-right: 0.5rem;
`

const WriteInCandidateForm = styled.div`
  background-color: lightgrey;
  margin: 1rem 0 -1rem;
  border-radius: 0.25rem;
  padding: 0.25rem;
`

const WriteInCandidateFieldSet = styled.fieldset`
  margin: 0.5rem 0.5rem 1rem;
`

const WriteInCandidateInput = styled.input.attrs({
  readOnly: true,
  type: 'text',
})`
  width: 100%;
  outline: none;
  box-shadow: 0 0 3px -1px rgba(0, 0, 0, 0.3);
  border: 1px solid darkgrey;
  padding: 0.25rem 0.35rem;
`

interface Props {
  contest: CandidateContestInterface
  vote: CandidateVote
  updateVote: UpdateVoteFunction
}

interface State {
  attemptedOverVoteCandidate: OptionalCandidate
  candidatePendingRemoval: OptionalCandidate
  writeInCandateModalIsOpen: boolean
  writeInCandidateName: string
}

const initialState = {
  attemptedOverVoteCandidate: undefined,
  candidatePendingRemoval: undefined,
  layoutName: 'default',
  writeInCandateModalIsOpen: false,
  writeInCandidateName: '',
}

class CandidateContest extends React.Component<Props, State> {
  private keyboard: React.RefObject<Keyboard>
  constructor(props: Props) {
    super(props)
    this.state = initialState
    this.keyboard = React.createRef()
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

  public handleUpdateSelection = (event: InputEvent) => {
    const { vote } = this.props
    const id = (event.target as HTMLInputElement).value
    const candidate = this.findCandidateById(vote, id)
    if (!!candidate) {
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
    attemptedOverVoteCandidate: OptionalCandidate
  ) => {
    this.setState({ attemptedOverVoteCandidate })
  }

  public closeAttemptedVoteAlert = () => {
    this.setState({ attemptedOverVoteCandidate: undefined })
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

  public onKeyboardInputChange = (writeInCandidateName: string) => {
    this.setState({ writeInCandidateName })
  }

  public render() {
    const { contest, vote } = this.props
    const hasReachedMaxSelections = contest.seats === vote.length
    const {
      attemptedOverVoteCandidate,
      candidatePendingRemoval,
      writeInCandidateName,
      writeInCandateModalIsOpen,
    } = this.state
    const maxWriteInCandidateLength = 40
    return (
      <React.Fragment>
        <FieldSet>
          <Legend>
            {contest.section && (
              <ContestSection>
                {contest.section}
                <span className="visually-hidden">.</span>
              </ContestSection>
            )}
            <Prose>
              <h1>
                {contest.title}
                <span className="visually-hidden">.</span>
              </h1>
              <p>
                <strong>Vote for {contest.seats}.</strong> You have selected{' '}
                {vote.length}.
              </p>
            </Prose>
          </Legend>
          <Choices>
            {contest.candidates.map((candidate, index) => {
              const isChecked = !!this.findCandidateById(vote, candidate.id)
              const isDisabled = hasReachedMaxSelections && !isChecked
              const handleDisabledClick = () => {
                if (isDisabled) {
                  this.handleChangeVoteAlert(candidate)
                }
              }
              return (
                <Choice
                  key={candidate.id}
                  htmlFor={candidate.id}
                  isSelected={isChecked}
                  onClick={handleDisabledClick}
                >
                  <ChoiceInput
                    autoFocus={isChecked || (index === 0 && !vote)}
                    id={candidate.id}
                    name={contest.id}
                    value={candidate.id}
                    onChange={this.handleUpdateSelection}
                    checked={isChecked}
                    disabled={isDisabled}
                    className="visually-hidden"
                  />
                  <Prose>
                    <strong>{candidate.name}</strong>
                    <span className="visually-hidden">,</span>
                    <br />
                    {candidate.party}
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
                        <strong>{candidate.name}</strong>
                      </Prose>
                    </Choice>
                  )
                })}
            {contest.allowWriteIns && !hasReachedMaxSelections && (
              <Choice
                as="button"
                isSelected={false}
                onClick={this.initWriteInCandidate}
              >
                <Prose>
                  <em>add write-in candidate</em>
                </Prose>
              </Choice>
            )}
          </Choices>
        </FieldSet>
        <Modal
          isOpen={!!attemptedOverVoteCandidate}
          content={
            <Prose>
              <Text>
                You may only select {contest.seats}{' '}
                {contest.seats === 1 ? 'candidate' : 'candidates'} in this
                contest. To vote for{' '}
                {attemptedOverVoteCandidate && attemptedOverVoteCandidate.name},
                you must first unselect selected{' '}
                {contest.seats === 1 ? 'candidate' : 'candidates'}.
              </Text>
            </Prose>
          }
          actions={
            <Button primary autoFocus onClick={this.closeAttemptedVoteAlert}>
              Okay
            </Button>
          }
        />
        <Modal
          isOpen={!!candidatePendingRemoval}
          content={
            <Prose>
              <Text>
                Are you sure you want to unselect and remove{' '}
                {candidatePendingRemoval && candidatePendingRemoval.name}?
              </Text>
            </Prose>
          }
          actions={
            <>
              <Button
                danger
                autoFocus
                onClick={this.confirmRemovePendingWriteInCandidate}
              >
                Yes, Remove.
              </Button>
              <Button onClick={this.clearCandidateIdPendingRemoval}>
                Cancel
              </Button>
            </>
          }
        />
        <Modal
          isOpen={writeInCandateModalIsOpen}
          content={
            <div>
              <Prose>
                <h2>Write-In Candidate</h2>
                <Text>
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
                    value={writeInCandidateName}
                    placeholder="candidate name"
                  />
                </WriteInCandidateFieldSet>
                <Keyboard
                  ref={this.keyboard}
                  layout={{
                    default: [
                      'Q W E R T Y U I O P',
                      'A S D F G H J K L -',
                      'Z X C V B N M , .',
                      '{space} {bksp}',
                    ],
                  }}
                  display={{
                    '{bksp}': '⌫ delete',
                    '{space}': 'space',
                  }}
                  mergeDisplay
                  disableCaretPositioning
                  maxLength={maxWriteInCandidateLength}
                  layoutName="default"
                  theme={'hg-theme-default vs-simple-keyboard'}
                  onChange={this.onKeyboardInputChange}
                  useButtonTag
                />
              </WriteInCandidateForm>
            </div>
          }
          actions={
            <>
              <Button
                primary={this.normalizeName(writeInCandidateName).length > 0}
                autoFocus
                onClick={this.addWriteInCandidate}
                disabled={this.normalizeName(writeInCandidateName).length === 0}
              >
                Accept
              </Button>
              <Button onClick={this.cancelWriteInCandidateModal}>Cancel</Button>
            </>
          }
        />
      </React.Fragment>
    )
  }
}

export default CandidateContest
