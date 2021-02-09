import electionJSON from './election.json'
import { parseElection } from '@votingworks/types'

const election = parseElection(electionJSON)

export default election
