import React from 'react'
import styled from 'styled-components'
import { Contest, InputEvent, UpdateVoteFunction, Vote } from '../config/types'

interface ChoiceProps {
  isSelected: boolean
}

const Choices = styled.div`
  display: inline-flex;
  flex-direction: column;
`
const Choice = styled.label`
  display: flex;
  margin-bottom: 1rem;
  border: 1px solid lightgrey;
  background: ${(props: ChoiceProps) =>
    props.isSelected ? 'lightgrey' : 'transparent'};
  padding: 0.5rem;
  :last-child {
    margin-bottom: 0;
  }
`

const ChoiceRadioInput = styled.input`
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
      <React.Fragment>
        <p>Vote for one</p>
        <Choices>
          {contest.candidates.map(c => {
            const isChecked = c.id === vote
            return (
              <Choice key={c.id} htmlFor={c.id} isSelected={isChecked}>
                <ChoiceRadioInput
                  id={c.id}
                  type="radio"
                  name={contest.id}
                  value={c.id}
                  onChange={this.updateSelection}
                  checked={isChecked}
                  className="Choice__Radio"
                />{' '}
                {c.name}
              </Choice>
            )
          })}
        </Choices>
      </React.Fragment>
    )
  }
}

export default SingleCandidateContest
