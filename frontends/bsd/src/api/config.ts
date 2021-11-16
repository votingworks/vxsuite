import {
  ElectionDefinition,
  MarkThresholds,
  Optional,
  Precinct,
  safeParseJson,
  unsafeParse,
} from '@votingworks/types';
import {
  GetCurrentPrecinctResponseSchema,
  GetElectionConfigResponse,
  GetElectionConfigResponseSchema,
  GetMarkThresholdOverridesConfigResponseSchema,
  GetTestModeConfigResponseSchema,
  PatchElectionConfigRequest,
  PatchMarkThresholdOverridesConfigRequest,
  PatchTestModeConfigRequest,
  PutCurrentPrecinctConfigRequest,
} from '@votingworks/types/api/services/scan';
import { ErrorsResponse, OkResponse } from '@votingworks/types/src/api';
import { fetchJson } from '@votingworks/utils';

async function patch<Body extends string | ArrayBuffer | unknown>(
  url: string,
  value: Body
): Promise<void> {
  const isJson =
    typeof value !== 'string' &&
    !(value instanceof ArrayBuffer) &&
    !(value instanceof Uint8Array);
  const response = await fetch(url, {
    method: 'PATCH',
    body: isJson ? JSON.stringify(value) : (value as BodyInit),
    headers: {
      'Content-Type': isJson ? 'application/json' : 'application/octet-stream',
    },
  });
  const body: OkResponse | ErrorsResponse = await response.json();

  if (body.status !== 'ok') {
    throw new Error(`PATCH ${url} failed: ${JSON.stringify(body.errors)}`);
  }
}

async function put<Body extends string | ArrayBuffer | unknown>(
  url: string,
  value: Body
): Promise<void> {
  const isJson =
    typeof value !== 'string' &&
    !(value instanceof ArrayBuffer) &&
    !(value instanceof Uint8Array);
  const response = await fetch(url, {
    method: 'PUT',
    body: isJson ? JSON.stringify(value) : (value as BodyInit),
    headers: {
      'Content-Type': isJson ? 'application/json' : 'application/octet-stream',
    },
  });
  const body: OkResponse | ErrorsResponse = await response.json();

  if (body.status !== 'ok') {
    throw new Error(`PUT ${url} failed: ${JSON.stringify(body.errors)}`);
  }
}

async function del(url: string): Promise<void> {
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  const body: OkResponse | ErrorsResponse = await response.json();

  if (body.status !== 'ok') {
    throw new Error(`DELETE ${url} failed: ${JSON.stringify(body.errors)}`);
  }
}

export async function getElection(): Promise<string | undefined> {
  const response = await fetch('/config/election');

  if (response.status === 404) {
    return undefined;
  }

  return response.text();
}

export async function getElectionDefinition(): Promise<
  ElectionDefinition | undefined
> {
  return (
    (safeParseJson(
      await (
        await fetch('/config/election', {
          headers: { Accept: 'application/json' },
        })
      ).text(),
      GetElectionConfigResponseSchema
    ).unsafeUnwrap() as Exclude<GetElectionConfigResponse, string>) ?? undefined
  );
}

export async function setElection(electionData?: string): Promise<void> {
  if (typeof electionData === 'undefined') {
    await del('/config/election');
  } else {
    await patch<PatchElectionConfigRequest>(
      '/config/election',
      new TextEncoder().encode(electionData)
    );
  }
}

export async function getTestMode(): Promise<boolean> {
  return safeParseJson(
    await (await fetch('/config/testMode')).text(),
    GetTestModeConfigResponseSchema
  ).unsafeUnwrap().testMode;
}

export async function setTestMode(testMode: boolean): Promise<void> {
  await patch<PatchTestModeConfigRequest>('/config/testMode', {
    testMode,
  });
  const newTestMode = await getTestMode();
  if (newTestMode !== testMode) {
    throw new Error('Error setting test mode, please try again');
  }
}

export async function getMarkThresholdOverrides(): Promise<
  MarkThresholds | undefined
> {
  const { markThresholdOverrides } = unsafeParse(
    GetMarkThresholdOverridesConfigResponseSchema,
    await fetchJson('/config/markThresholdOverrides')
  );
  return markThresholdOverrides;
}

export async function setMarkThresholdOverrides(
  markThresholdOverrides?: MarkThresholds
): Promise<void> {
  if (typeof markThresholdOverrides === 'undefined') {
    await del('/config/markThresholdOverrides');
  } else {
    await patch<PatchMarkThresholdOverridesConfigRequest>(
      '/config/markThresholdOverrides',
      { markThresholdOverrides }
    );
  }
}

export async function getCurrentPrecinctId(): Promise<
  Optional<Precinct['id']>
> {
  return safeParseJson(
    await (
      await fetch('/config/precinct', {
        headers: { Accept: 'application/json' },
      })
    ).text(),
    GetCurrentPrecinctResponseSchema
  ).unsafeUnwrap().precinctId;
}

export async function setCurrentPrecinctId(
  precinctId: Precinct['id']
): Promise<void> {
  await put<PutCurrentPrecinctConfigRequest>('/config/precinct', {
    precinctId,
  });
}
