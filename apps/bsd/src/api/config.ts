import { ElectionDefinition, MarkThresholds } from '@votingworks/types'
import { ErrorResponse, OkResponse } from '../config/types'
import fetchJSON from '../util/fetchJSON'

async function patch(url: string, value: unknown): Promise<void> {
  const isJSON = typeof value !== 'string' && !(value instanceof ArrayBuffer)
  const response = await fetch(url, {
    method: 'PATCH',
    body: isJSON ? JSON.stringify(value) : (value as BodyInit),
    headers: {
      'Content-Type': isJSON ? 'application/json' : 'application/octet-stream',
    },
  })
  const body: OkResponse | ErrorResponse = await response.json()

  if (body.status !== 'ok') {
    throw new Error(`PATCH ${url} failed: ${body.error}`)
  }
}

async function del(url: string): Promise<void> {
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  })
  const body: OkResponse | ErrorResponse = await response.json()

  if (body.status !== 'ok') {
    throw new Error(`DELETE ${url} failed: ${body.error}`)
  }
}

export async function getElection(): Promise<string | undefined> {
  const response = await fetch('/config/election')

  if (response.status === 404) {
    return undefined
  }

  return response.text()
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

export async function getMarkThresholdOverrides(): Promise<
  MarkThresholds | undefined
> {
  const { markThresholdOverrides } = await fetchJSON(
    '/config/markThresholdOverrides'
  )
  return markThresholdOverrides
}

export async function setMarkThresholdOverrides(
  markThresholdOverrides?: MarkThresholds
): Promise<void> {
  if (typeof markThresholdOverrides === 'undefined') {
    await del('/config/markThresholdOverrides')
  } else {
    await patch('/config/markThresholdOverrides', markThresholdOverrides)
  }
}
