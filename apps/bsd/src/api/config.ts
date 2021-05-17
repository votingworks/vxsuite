import {
  ElectionDefinition,
  MarkThresholds,
  safeParseJSON,
} from '@votingworks/types'
import {
  GetElectionConfigResponse,
  GetElectionConfigResponseSchema,
  GetTestModeConfigResponseSchema,
  PatchElectionConfigRequest,
  PatchMarkThresholdOverridesConfigRequest,
  PatchTestModeConfigRequest,
} from '@votingworks/types/api/module-scan'
import { ErrorsResponse, OkResponse } from '@votingworks/types/src/api'
import fetchJSON from '../util/fetchJSON'

async function patch<Body extends string | ArrayBuffer | unknown>(
  url: string,
  value: Body
): Promise<void> {
  const isJSON = typeof value !== 'string' && !(value instanceof ArrayBuffer)
  const response = await fetch(url, {
    method: 'PATCH',
    body: isJSON ? JSON.stringify(value) : (value as BodyInit),
    headers: {
      'Content-Type': isJSON ? 'application/json' : 'application/octet-stream',
    },
  })
  const body: OkResponse | ErrorsResponse = await response.json()

  if (body.status !== 'ok') {
    throw new Error(`PATCH ${url} failed: ${JSON.stringify(body.errors)}`)
  }
}

async function del(url: string): Promise<void> {
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  })
  const body: OkResponse | ErrorsResponse = await response.json()

  if (body.status !== 'ok') {
    throw new Error(`DELETE ${url} failed: ${JSON.stringify(body.errors)}`)
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
  return (
    (safeParseJSON(
      await (
        await fetch('/config/election', {
          headers: { Accept: 'application/json' },
        })
      ).text(),
      GetElectionConfigResponseSchema
    ).unwrap() as Exclude<GetElectionConfigResponse, string>) ?? undefined
  )
}

export async function setElection(electionData?: string): Promise<void> {
  if (typeof electionData === 'undefined') {
    await del('/config/election')
  } else {
    await patch<PatchElectionConfigRequest>(
      '/config/election',
      new TextEncoder().encode(electionData)
    )
  }
}

export async function getTestMode(): Promise<boolean> {
  return safeParseJSON(
    await (await fetch('/config/testMode')).text(),
    GetTestModeConfigResponseSchema
  ).unwrap().testMode
}

export async function setTestMode(testMode: boolean): Promise<void> {
  await patch<PatchTestModeConfigRequest>('/config/testMode', { testMode })
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
    await patch<PatchMarkThresholdOverridesConfigRequest>(
      '/config/markThresholdOverrides',
      { markThresholdOverrides }
    )
  }
}
