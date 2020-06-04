import { Election } from '@votingworks/ballot-encoder'
import {
  DeleteElectionResponse,
  GetElectionResponse,
  PutElectionResponse,
} from '../config/types'
import fetchJSON from '../util/fetchJSON'

export async function get(): Promise<Election | undefined> {
  try {
    return await fetchJSON<GetElectionResponse>('/config/election')
  } catch {
    return undefined
  }
}

export async function put(election: Election): Promise<void> {
  const response = await fetchJSON<PutElectionResponse>('/config/election', {
    method: 'put',
    body: JSON.stringify(election),
    headers: { 'Content-Type': 'application/json' },
  })

  if (response.status !== 'ok') {
    throw new Error(`failed with response status: ${response.status}`)
  }
}

async function deleteElection(): Promise<void> {
  const response = await fetchJSON<DeleteElectionResponse>('/config/election', {
    method: 'delete',
  })

  if (response.status !== 'ok') {
    throw new Error(`failed with response status: ${response.status}`)
  }
}

export { deleteElection as delete }
