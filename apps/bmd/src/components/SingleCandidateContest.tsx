import React from 'react'
import styled from 'styled-components'
import { Contest, InputEvent, UpdateVoteFunction, Vote } from '../config/types'

import Modal from '../components/Modal'
import { Text } from '../components/Typography'

const FieldSet = styled.fieldset`
  margin: 0;
  border: none;
  padding: 0;
`
const Legend = styled.legend`
  font-weight: bold;
  font-size: 2em;
  margin: 0.67em 0;
`
const Choices = styled.div`
  display: flex;
  flex-direction: column;
`
const Choice = styled('label')<{ isSelected: boolean }>`
  display: flex;
  margin-bottom: 1rem;
  border: 1px solid lightgrey;
  background: ${({ isSelected }) => (isSelected ? 'lightgrey' : 'transparent')};
  padding: 0.5rem;
  :last-child {
    margin-bottom: 0;
  }
  :focus-within {
    outline: -webkit-focus-ring-color auto 5px;
  }
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
  candidateName: string
}

const initialState = {
  candidateName: '',
}

class SingleCandidateContest extends React.Component<Props, State> {
  public state: State = initialState

  public updateSelection = (event: InputEvent) => {
    const target = event.target as HTMLInputElement
    this.props.updateVote(
      this.props.contest.id,
      target.value === this.props.vote ? '' : target.value
    )
  }

  public handleChangeVoteAlert = (candidateName: string) => {
    this.setState({ candidateName })
  }

  public closeAlert = () => {
    this.setState({ candidateName: '' })
  }

  // TODO:
  // - confirm intent when navigating away without selecting a candidate
  // - confirm intent when changing candidate

  public render() {
    const { contest, vote } = this.props
    const { candidateName } = this.state
    return (
      <React.Fragment>
        <FieldSet>
          <Legend>{contest.title}</Legend>
          <p>Vote for one</p>
          <Choices>
            {contest.candidates.map((candidate, index) => {
              const isChecked = candidate.id === vote
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
                    onChange={this.updateSelection}
                    checked={isChecked}
                    disabled={!!vote && !isChecked}
                  />{' '}
                  {candidate.name}
                </Choice>
              )
            })}
          </Choices>
        </FieldSet>
        <Modal isOpen={!!candidateName}>
          <Text>
            To vote for {candidateName}, first uncheck the vote for {vote}.
          </Text>
          <button onClick={this.closeAlert}>Okay</button>
        </Modal>
      </React.Fragment>
    )
  }
}

export default SingleCandidateContest
