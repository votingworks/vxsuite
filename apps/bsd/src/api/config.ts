import { MarkThresholds } from '@votingworks/types'
import { ErrorResponse, GetConfigResponse, OkResponse } from '../config/types'
import { ElectionDefinition } from '../util/ballot-package'
import fetchJSON from '../util/fetchJSON'

export async function get(): Promise<GetConfigResponse> {
  return fetchJSON<GetConfigResponse>('/config')
}

async function patch(url: string, value: unknown): Promise<void> {
  const response = await fetch(url, {
    method: 'PATCH',
    body: JSON.stringify(value),
    headers: { 'Content-Type': 'application/json' },
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

export async function setElectionDefinition(
  electionDefinition?: ElectionDefinition
): Promise<void> {
  if (typeof electionDefinition === 'undefined') {
    await del('/config/electionDefinition')
  } else {
    await patch('/config/electionDefinition', electionDefinition)
  }
}

export async function setTestMode(testMode: boolean): Promise<void> {
  await patch('/config/testMode', { testMode })
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
