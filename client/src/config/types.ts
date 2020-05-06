import { OptionalElection } from '@votingworks/ballot-encoder'

// Events
export type InputEventFunction = (
  event: React.FormEvent<HTMLInputElement>
) => void | Promise<void>
export type ButtonEventFunction = (
  event: React.MouseEvent<HTMLButtonElement>
) => void | Promise<void>

// Election
export type SaveElection = (value: OptionalElection) => void

// Router Props
export interface BallotScreenProps {
  styleId: string
  precinctId: string
}
