import {
  ElectionDefinition,
  Optional,
  Precinct,
  safeParseJSON,
} from '@votingworks/types'
import { ErrorsResponse, OkResponse } from '@votingworks/types/api'
import {
  GetCurrentPrecinctResponseSchema,
  GetElectionConfigResponse,
  GetElectionConfigResponseSchema,
  GetTestModeConfigResponseSchema,
  PatchTestModeConfigRequest,
  PutCurrentPrecinctConfigRequest,
} from '@votingworks/types/api/module-scan'

async function patch<Body extends string | ArrayBuffer | unknown>(
  url: string,
  value: Body
): Promise<void> {
  const isJSON =
    typeof value !== 'string' &&
    !(value instanceof ArrayBuffer) &&
    !(value instanceof Uint8Array)
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

async function put<Body extends string | ArrayBuffer | unknown>(
  url: string,
  value: Body
): Promise<void> {
  const isJSON =
    typeof value !== 'string' &&
    !(value instanceof ArrayBuffer) &&
    !(value instanceof Uint8Array)
  const response = await fetch(url, {
    method: 'PUT',
    body: isJSON ? JSON.stringify(value) : (value as BodyInit),
    headers: {
      'Content-Type': isJSON ? 'application/json' : 'application/octet-stream',
    },
  })
  const body: OkResponse | ErrorsResponse = await response.json()

  if (body.status !== 'ok') {
    throw new Error(`PUT ${url} failed: ${JSON.stringify(body.errors)}`)
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
    // TODO(528) add proper typing here
    await patch('/config/election', electionData)
  }
}

export async function getTestMode(): Promise<boolean> {
  return safeParseJSON(
    await (await fetch('/config/testMode')).text(),
    GetTestModeConfigResponseSchema
  ).unwrap().testMode
}

export async function setTestMode(testMode: boolean): Promise<void> {
  await patch<PatchTestModeConfigRequest>('/config/testMode', {
    testMode,
  })
}

export async function getCurrentPrecinctId(): Promise<
  Optional<Precinct['id']>
> {
  return safeParseJSON(
    await (
      await fetch('/config/precinct', {
        headers: { Accept: 'application/json' },
      })
    ).text(),
    GetCurrentPrecinctResponseSchema
  ).unwrap().precinctId
}

export async function setCurrentPrecinctId(
  precinctId: Precinct['id']
): Promise<void> {
  await put<PutCurrentPrecinctConfigRequest>('/config/precinct', { precinctId })
}
