import React from 'react'
import styled from 'styled-components'
import {
  CandidateContest as CandidateContestInterface,
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
  vote: OptionalCandidate
  updateVote: UpdateVoteFunction
}

interface State {
  attemptedVoteCandidateName: string
  writeInCandateModalIsOpen: boolean
  writeInCandidateName: string
  layoutName: string
}

const initialState = {
  attemptedVoteCandidateName: '',
  layoutName: 'default',
  writeInCandateModalIsOpen: false,
  writeInCandidateName: '',
}

class CandidateContest extends React.Component<Props, State> {
  private keyboard: React.RefObject<Keyboard>
  constructor(props: Props) {
    super(props)
    this.state = {
      ...initialState,
      writeInCandidateName:
        (props.vote &&
          props.vote.id === 'writeInCandidate' &&
          props.vote.name) ||
        '',
    }
    this.keyboard = React.createRef()
  }

  public selectCandidate = (candidate: OptionalCandidate) => {
    this.props.updateVote(this.props.contest.id, candidate)
  }

  public handleUpdateSelection = (event: InputEvent) => {
    const { contest, vote } = this.props
    const { value } = event.target as HTMLInputElement
    const targetIsSelected = vote && value === vote.id
    this.selectCandidate(
      targetIsSelected
        ? undefined
        : contest.candidates.find(candidate => candidate.id === value)
    )
  }

  public handleChangeVoteAlert = (attemptedVoteCandidateName: string) => {
    this.setState({ attemptedVoteCandidateName })
  }

  public closeAttemptedVoteAlert = () => {
    this.setState({ attemptedVoteCandidateName: '' })
  }

  public handleSelectWriteInCandidate = () => {
    const { vote } = this.props
    if (!!vote && vote.name === this.state.writeInCandidateName) {
      this.selectCandidate(undefined)
    } else {
      this.toggleWriteInCandidateModal(true)
    }
  }
  public handleWriteInCandidateDisabledClick = () => {
    const { vote } = this.props
    const { writeInCandidateName } = this.state
    if (!!vote && vote.name !== writeInCandidateName) {
      this.handleChangeVoteAlert(writeInCandidateName || 'a write-in candidate')
    }
  }

  public normalizeName = (name: string) =>
    name
      .trim()
      .replace(/\t+/g, ' ')
      .replace(/\s+/g, ' ')
  public selectWriteInCandidate = () => {
    const writeInCandidateName = this.normalizeName(
      this.state.writeInCandidateName
    )
    this.setState({ writeInCandidateName })
    this.selectCandidate({
      id: 'writeInCandidate',
      name: writeInCandidateName,
    })
    this.toggleWriteInCandidateModal(false)
  }
  public closeWriteInCandidateModal = () => {
    const writeInCandidateName = this.normalizeName(
      this.state.writeInCandidateName
    )
    this.setState({ writeInCandidateName })
    this.toggleWriteInCandidateModal(false)
  }
  public toggleWriteInCandidateModal = (writeInCandateModalIsOpen: boolean) => {
    this.setState({ writeInCandateModalIsOpen })
  }

  public setKeyboardInput = () => {
    this.keyboard.current!.setInput!(this.state.writeInCandidateName)
  }

  public onKeyboardInputChange = (writeInCandidateName: string) => {
    this.setState({ writeInCandidateName })
  }

  public render() {
    const { contest, vote } = this.props
    const {
      attemptedVoteCandidateName,
      writeInCandidateName,
      writeInCandateModalIsOpen,
    } = this.state
    const maxWriteInCandidateLength = 40
    const writeInCandidateIsChecked =
      !!vote && vote.name === writeInCandidateName
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
                <strong>Vote for 1.</strong> You have selected{' '}
                {!!vote ? `1` : `0`}.
              </p>
            </Prose>
          </Legend>
          <Choices>
            {contest.candidates.map((candidate, index) => {
              const isChecked = !!vote && candidate.name === vote.name
              const handleDisabledClick = () => {
                if (vote && !isChecked) {
                  this.handleChangeVoteAlert(candidate.name)
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
                    disabled={!!vote && !isChecked}
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
            <Choice
              htmlFor="writeInCandidate"
              isSelected={writeInCandidateIsChecked}
              onClick={this.handleWriteInCandidateDisabledClick}
            >
              <ChoiceInput
                autoFocus={writeInCandidateIsChecked}
                id="writeInCandidate"
                name={contest.id}
                value="writeInCandidate"
                onChange={this.handleSelectWriteInCandidate}
                checked={writeInCandidateIsChecked}
                disabled={!!vote && !writeInCandidateIsChecked}
                className="visually-hidden"
              />
              <Prose>
                {!!writeInCandidateName ? (
                  <strong>{writeInCandidateName}</strong>
                ) : (
                  <em>add a write-in candidate</em>
                )}
              </Prose>
            </Choice>
          </Choices>
        </FieldSet>
        <Modal
          isOpen={!!attemptedVoteCandidateName}
          content={
            <Prose>
              <Text>
                To vote for {attemptedVoteCandidateName}, first uncheck the vote
                for {!!vote && vote.name}.
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
          isOpen={writeInCandateModalIsOpen}
          onAfterOpen={this.setKeyboardInput}
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
                onClick={this.selectWriteInCandidate}
                disabled={this.normalizeName(writeInCandidateName).length === 0}
              >
                Accept
              </Button>
              <Button onClick={this.closeWriteInCandidateModal}>Close</Button>
            </>
          }
        />
      </React.Fragment>
    )
  }
}

export default CandidateContest
