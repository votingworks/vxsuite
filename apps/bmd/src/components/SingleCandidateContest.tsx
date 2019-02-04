import React from 'react'
import styled from 'styled-components'
import { Contest, InputEvent, UpdateVoteFunction, Vote } from '../config/types'

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
  display: inline-flex;
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
const ChoiceRadioInput = styled.input.attrs({
  type: 'radio',
})`
  margin-right: 0.5rem;
`

export interface Props {
  contest: Contest
  vote: Vote
  updateVote: UpdateVoteFunction
}

class SingleCandidateContest extends React.Component<Props, {}> {
  public updateSelection = (event: InputEvent) => {
    const target = event.target as HTMLInputElement
    this.props.updateVote(this.props.contest.id, target.value)
  }

  // TODO:
  // - confirm intent when navigating away without selecting a candidate
  // - confirm intent when changing candidate

  public render() {
    const { contest, vote } = this.props
    return (
      <FieldSet>
        <Legend>{contest.title}</Legend>
        <p>Vote for one</p>
        <Choices>
          {contest.candidates.map((candidate, index) => {
            const isChecked = candidate.id === vote
            return (
              <Choice
                key={candidate.id}
                htmlFor={candidate.id}
                isSelected={isChecked}
              >
                <ChoiceRadioInput
                  autoFocus={index === 0 && !vote}
                  id={candidate.id}
                  name={contest.id}
                  value={candidate.id}
                  onChange={this.updateSelection}
                  checked={isChecked}
                />{' '}
                {candidate.name}
              </Choice>
            )
          })}
        </Choices>
      </FieldSet>
    )
  }
}

export default SingleCandidateContest
