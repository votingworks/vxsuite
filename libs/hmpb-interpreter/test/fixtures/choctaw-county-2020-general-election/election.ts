import { parseElection } from '@votingworks/ballot-encoder'
import electionJSON from './election.json'

export default parseElection(electionJSON)
