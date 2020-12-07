import { parseElection } from '@votingworks/ballot-encoder'
import election from './election.json'

export default parseElection(election)
