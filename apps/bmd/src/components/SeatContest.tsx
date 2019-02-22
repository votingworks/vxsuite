import React from 'react'
import styled from 'styled-components'
import { Contest, InputEvent, UpdateVoteFunction, Vote } from '../config/types'

import Button from './Button'
import Modal from './Modal'
import Prose from './Prose'
import { Text } from './Typography'

const FieldSet = styled.fieldset`
  margin: 0;
  border: none;
  padding: 0;
`
const Legend = styled.legend`
  margin: 0 0 1rem 4rem;
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
  // & .candidate-party {
  //   text-align: right;
  // }
`
const ChoiceInput = styled.input.attrs({
  type: 'checkbox',
})`
  margin-right: 0.5rem;
`

interface Props {
  contest: Contest
  vote: Vote
  updateVote: UpdateVoteFunction
}

interface State {
  attemptedCandidateSelection: string
}

const initialState = {
  attemptedCandidateSelection: '',
}

class SeatContest extends React.Component<Props, State> {
  public state: State = initialState

  public updateSelection = (event: InputEvent) => {
    const target = event.target as HTMLInputElement
    this.props.updateVote(
      this.props.contest.id,
      target.value === this.props.vote ? '' : target.value
    )
  }

  public handleChangeVoteAlert = (attemptedCandidateSelection: string) => {
    this.setState({ attemptedCandidateSelection })
  }

  public closeAlert = () => {
    this.setState({ attemptedCandidateSelection: '' })
  }

  // TODO:
  // - confirm intent when navigating away without selecting a candidate
  // - confirm intent when changing candidate

  public render() {
    const { contest, vote } = this.props
    const { attemptedCandidateSelection } = this.state
    const selectedCandidate = contest.candidates.find(
      candidate => candidate.name === vote
    )
    return (
      <React.Fragment>
        <FieldSet>
          <Legend>
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
                    onChange={this.updateSelection}
                    checked={isChecked}
                    disabled={!!vote && !isChecked}
                    className="visually-hidden"
                  />
                  <div className="candidate-name">
                    <strong>{candidate.name}</strong>
                  </div>
                  <div className="candidate-party">{candidate.party}</div>
                </Choice>
              )
            })}
          </Choices>
        </FieldSet>
        <Modal
          isOpen={!!attemptedCandidateSelection}
          content={
            <Prose>
              <Text>
                To vote for {attemptedCandidateSelection}, first uncheck the
                vote for {vote}.
              </Text>
            </Prose>
          }
          actions={
            <Button primary autoFocus onClick={this.closeAlert}>
              Okay
            </Button>
          }
        />
      </React.Fragment>
    )
  }
}

export default SeatContest
