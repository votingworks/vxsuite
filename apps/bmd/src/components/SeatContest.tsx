import React from 'react'
import styled from 'styled-components'
import { Contest, InputEvent, UpdateVoteFunction, Vote } from '../config/types'

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
  margin-bottom: 1rem;
  @media (min-width: 480px) {
    margin-left: 4rem;
  }
`
const Choices = styled.div`
  display: grid;
  grid-auto-rows: minmax(auto, 1fr);
  grid-gap: 0.75rem;
`
const Choice = styled('label')<{ isSelected: boolean }>`
  position: relative;
  cursor: pointer;
  display: grid;
  grid-template-columns: 3fr 1fr;
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
  & > div {
    padding: 1rem;
  }
  & > input + div:before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-right: 1px solid lightgrey;
    width: 3rem;
    text-align: center;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 2rem;
    border-radius: 0.125rem 0 0 0.125rem;
  }
  & > input:checked + div:before {
    content: '✓';
    background: white;
    color: #028099;
    border-color: #028099;
  }
  & > div:first-of-type {
    padding-left: 4rem;
  }
  & .write-in-candidate-name {
    grid-column: span 2;
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
  contest: Contest
  vote: Vote
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

class SeatContest extends React.Component<Props, State> {
  private keyboard: React.RefObject<Keyboard>
  constructor(props: Props) {
    super(props)
    let writeInCandidateName = ''
    if (typeof props.vote === 'string') {
      writeInCandidateName =
        !!props.vote &&
        props.contest.candidates
          .map(candidate => candidate.name)
          .includes(props.vote)
          ? ''
          : props.vote
    }
    this.state = {
      ...initialState,
      writeInCandidateName,
    }
    this.keyboard = React.createRef()
  }

  public selectCandidate = (selection: string) => {
    this.props.updateVote(this.props.contest.id, selection || '')
  }

  public handleUpdateSelection = (event: InputEvent) => {
    const target = event.target as HTMLInputElement
    const targetIsSelected = target.value === this.props.vote
    this.selectCandidate(targetIsSelected ? '' : target.value)
  }

  public handleChangeVoteAlert = (attemptedVoteCandidateName: string) => {
    this.setState({ attemptedVoteCandidateName })
  }

  public closeAttemptedVoteAlert = () => {
    this.setState({ attemptedVoteCandidateName: '' })
  }

  public handleSelectWriteInCandidate = () => {
    if (
      !!this.props.vote &&
      this.props.vote === this.state.writeInCandidateName
    ) {
      this.selectCandidate('')
    } else {
      this.toggleWriteInCandidateModal(true)
    }
  }
  public handleWriteInCandidateDisabledClick = () => {
    if (
      !!this.props.vote &&
      this.props.vote !== this.state.writeInCandidateName
    ) {
      this.handleChangeVoteAlert(
        this.state.writeInCandidateName || 'a write-in candidate'
      )
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
    this.selectCandidate(writeInCandidateName)
    this.toggleWriteInCandidateModal(false)
  }
  public closeWriteInCandidateModal = () => {
    const writeInCandidateName = this.normalizeName(
      this.state.writeInCandidateName
    )
    if (writeInCandidateName.length === 0) {
      this.setState({ writeInCandidateName })
    } else {
      this.selectCandidate(writeInCandidateName)
    }
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

  public onKeyboardKeyPress = (button: string) => {
    if (button === '{shift}' || button === '{lock}') {
      this.handleKeyboardShiftKey()
    }
  }

  public handleKeyboardShiftKey = () => {
    const layoutName = this.state.layoutName

    this.setState({
      layoutName: layoutName === 'default' ? 'shift' : 'default',
    })
  }

  public render() {
    const { contest, vote } = this.props
    const { attemptedVoteCandidateName } = this.state
    const writeInCandidateIsChecked =
      !!vote && vote === this.state.writeInCandidateName
    return (
      <React.Fragment>
        <FieldSet>
          <Legend>
            {contest.section && (
              <ContestSection>{contest.section}</ContestSection>
            )}
            <Prose>
              <h1>{contest.title}</h1>
              <p>
                <strong>Vote for 1.</strong> You have selected{' '}
                {!!vote ? `1` : `0`}.
              </p>
            </Prose>
          </Legend>
          <Choices>
            {contest.candidates.map((candidate, index) => {
              const isChecked = candidate.name === vote
              const handleDisabledClick = () => {
                if (vote && !isChecked) {
                  this.handleChangeVoteAlert(candidate.name)
                }
              }
              return (
                <Choice
                  key={candidate.name}
                  htmlFor={candidate.name}
                  isSelected={isChecked}
                  onClick={handleDisabledClick}
                >
                  <ChoiceInput
                    autoFocus={isChecked || (index === 0 && !vote)}
                    id={candidate.name}
                    name={contest.id}
                    value={candidate.name}
                    onChange={this.handleUpdateSelection}
                    checked={isChecked}
                    disabled={!!vote && !isChecked}
                    className="visually-hidden"
                  />
                  <div>
                    <strong>{candidate.name}</strong>
                  </div>
                  <div>{candidate.party}</div>
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
              <div className="write-in-candidate-name">
                {!!this.state.writeInCandidateName ? (
                  <strong>{this.state.writeInCandidateName}</strong>
                ) : (
                  <em>add a write-in candidate</em>
                )}
              </div>
            </Choice>
          </Choices>
        </FieldSet>
        <Modal
          isOpen={!!attemptedVoteCandidateName}
          content={
            <Prose>
              <Text>
                To vote for {attemptedVoteCandidateName}, first uncheck the vote
                for {vote}.
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
          isOpen={this.state.writeInCandateModalIsOpen}
          onAfterOpen={this.setKeyboardInput}
          content={
            <div>
              <Prose>
                <h2>Write-In Candidate</h2>
                <Text>
                  Use this screen to vote for a person who is{' '}
                  <strong>not</strong> on the ballot.
                </Text>
              </Prose>
              <WriteInCandidateForm>
                <WriteInCandidateFieldSet>
                  <legend>
                    <label htmlFor="WriteInCandidateName">
                      <Prose>
                        <Text bold small>
                          Write-In Candidate Name for {contest.title}
                        </Text>
                      </Prose>
                    </label>
                  </legend>
                  <WriteInCandidateInput
                    id="WriteInCandidateName"
                    value={this.state.writeInCandidateName}
                    placeholder="Use the keyboard to enter a candidate name"
                  />
                </WriteInCandidateFieldSet>
                <Keyboard
                  ref={this.keyboard}
                  layoutName={this.state.layoutName}
                  theme={'hg-theme-default vs-simple-keyboard'}
                  onChange={this.onKeyboardInputChange}
                  onKeyPress={this.onKeyboardKeyPress}
                  useButtonTag
                />
              </WriteInCandidateForm>
            </div>
          }
          actions={
            <>
              <Button
                primary={
                  this.normalizeName(this.state.writeInCandidateName).length > 0
                }
                autoFocus
                onClick={this.selectWriteInCandidate}
                disabled={
                  this.normalizeName(this.state.writeInCandidateName).length ===
                  0
                }
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

export default SeatContest
