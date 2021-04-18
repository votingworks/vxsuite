import {
  ElectionDefinition,
  ErrorAPIResponse,
  OkAPIResponse,
} from '@votingworks/types'
import fetchJSON from '../utils/fetchJSON'

async function patch(url: string, value: unknown): Promise<void> {
  const isJSON = typeof value !== 'string' && !(value instanceof ArrayBuffer)
  const response = await fetch(url, {
    method: 'PATCH',
    body: isJSON ? JSON.stringify(value) : (value as BodyInit),
    headers: {
      'Content-Type': isJSON ? 'application/json' : 'application/octet-stream',
    },
  })
  const body: OkAPIResponse | ErrorAPIResponse = await response.json()

  if (body.status !== 'ok') {
    throw new Error(`PATCH ${url} failed: ${body.error}`)
  }
}

async function del(url: string): Promise<void> {
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  })
  const body: OkAPIResponse | ErrorAPIResponse = await response.json()

  if (body.status !== 'ok') {
    throw new Error(`DELETE ${url} failed: ${body.error}`)
  }
}

export async function getElectionDefinition(): Promise<
  ElectionDefinition | undefined
> {
  return (await fetchJSON('/config/election')) ?? undefined
}

export async function setElection(electionData?: string): Promise<void> {
  if (typeof electionData === 'undefined') {
    await del('/config/election')
  } else {
    await patch('/config/election', electionData)
  }
}

export async function getTestMode(): Promise<boolean> {
  const { testMode } = await fetchJSON('/config/testMode')
  return testMode
}

export async function setTestMode(testMode: boolean): Promise<void> {
  await patch('/config/testMode', { testMode })
}
