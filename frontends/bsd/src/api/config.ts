import {
  ElectionDefinition,
  MarkThresholds,
  Optional,
  Precinct,
  safeParseJson,
  unsafeParse,
} from '@votingworks/types';
import { ErrorsResponse, OkResponse, Scan } from '@votingworks/api';
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
  const response = await fetch('/central-scanner/config/election');

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
        await fetch('/central-scanner/config/election', {
          headers: { Accept: 'application/json' },
        })
      ).text(),
      Scan.GetElectionConfigResponseSchema
    ).unsafeUnwrap() as Exclude<Scan.GetElectionConfigResponse, string>) ??
    undefined
  );
}

export async function setElection(
  electionData?: string,
  { ignoreBackupRequirement }: { ignoreBackupRequirement?: boolean } = {}
): Promise<void> {
  if (typeof electionData === 'undefined') {
    let deletionUrl = '/central-scanner/config/election';
    if (ignoreBackupRequirement) {
      deletionUrl += '?ignoreBackupRequirement=true';
    }
    await del(deletionUrl);
  } else {
    await patch<Scan.PatchElectionConfigRequest>(
      '/central-scanner/config/election',
      new TextEncoder().encode(electionData)
    );
  }
}

export async function getTestMode(): Promise<boolean> {
  return safeParseJson(
    await (await fetch('/central-scanner/config/testMode')).text(),
    Scan.GetTestModeConfigResponseSchema
  ).unsafeUnwrap().testMode;
}

export async function setTestMode(testMode: boolean): Promise<void> {
  await patch<Scan.PatchTestModeConfigRequest>(
    '/central-scanner/config/testMode',
    {
      testMode,
    }
  );
  const newTestMode = await getTestMode();
  if (newTestMode !== testMode) {
    throw new Error('Error setting test mode, please try again');
  }
}

export async function getMarkThresholdOverrides(): Promise<
  MarkThresholds | undefined
> {
  const { markThresholdOverrides } = unsafeParse(
    Scan.GetMarkThresholdOverridesConfigResponseSchema,
    await fetchJson('/central-scanner/config/markThresholdOverrides')
  );
  return markThresholdOverrides;
}

export async function setMarkThresholdOverrides(
  markThresholdOverrides?: MarkThresholds
): Promise<void> {
  if (typeof markThresholdOverrides === 'undefined') {
    await del('/central-scanner/config/markThresholdOverrides');
  } else {
    await patch<Scan.PatchMarkThresholdOverridesConfigRequest>(
      '/central-scanner/config/markThresholdOverrides',
      { markThresholdOverrides }
    );
  }
}

export async function getCurrentPrecinctId(): Promise<
  Optional<Precinct['id']>
> {
  return safeParseJson(
    await (
      await fetch('/central-scanner/config/precinct', {
        headers: { Accept: 'application/json' },
      })
    ).text(),
    Scan.GetCurrentPrecinctResponseSchema
  ).unsafeUnwrap().precinctId;
}

export async function setCurrentPrecinctId(
  precinctId: Precinct['id']
): Promise<void> {
  await put<Scan.PutCurrentPrecinctConfigRequest>(
    '/central-scanner/config/precinct',
    {
      precinctId,
    }
  );
}
