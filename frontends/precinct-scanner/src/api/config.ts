import {
  ElectionDefinition,
  Optional,
  Precinct,
  MarkThresholds,
  safeParseJson,
} from '@votingworks/types';
import { ErrorsResponse, OkResponse, Scan } from '@votingworks/api';

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
      'Content-Type': /* istanbul ignore next */ isJson
        ? 'application/json'
        : 'application/octet-stream',
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
    body: /* istanbul ignore next */ isJson
      ? JSON.stringify(value)
      : (value as BodyInit),
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

export async function getElectionDefinition(): Promise<
  ElectionDefinition | undefined
> {
  return (
    (safeParseJson(
      await (
        await fetch('/precinct-scanner/config/election', {
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
    let deletionUrl = '/precinct-scanner/config/election';
    if (ignoreBackupRequirement) {
      deletionUrl += '?ignoreBackupRequirement=true';
    }
    await del(deletionUrl);
  } else {
    // TODO(528) add proper typing here
    await patch('/precinct-scanner/config/election', electionData);
  }
}

export async function getTestMode(): Promise<boolean> {
  return safeParseJson(
    await (await fetch('/precinct-scanner/config/testMode')).text(),
    Scan.GetTestModeConfigResponseSchema
  ).unsafeUnwrap().testMode;
}

export async function setTestMode(testMode: boolean): Promise<void> {
  await patch<Scan.PatchTestModeConfigRequest>(
    '/precinct-scanner/config/testMode',
    {
      testMode,
    }
  );
}

export async function getMarkThresholds(): Promise<Optional<MarkThresholds>> {
  return safeParseJson(
    await (
      await fetch('/precinct-scanner/config/markThresholdOverrides', {
        headers: { Accept: 'application/json' },
      })
    ).text(),
    Scan.GetMarkThresholdOverridesConfigResponseSchema
  ).unsafeUnwrap().markThresholdOverrides;
}

export async function setMarkThresholdOverrides(
  markThresholdOverrides?: MarkThresholds
): Promise<void> {
  if (typeof markThresholdOverrides === 'undefined') {
    await del('/precinct-scanner/config/markThresholdOverrides');
  } else {
    await patch<Scan.PatchMarkThresholdOverridesConfigRequest>(
      '/precinct-scanner/config/markThresholdOverrides',
      { markThresholdOverrides }
    );
  }
}

export async function getCurrentPrecinctId(): Promise<
  Optional<Precinct['id']>
> {
  return safeParseJson(
    await (
      await fetch('/precinct-scanner/config/precinct', {
        headers: { Accept: 'application/json' },
      })
    ).text(),
    Scan.GetCurrentPrecinctResponseSchema
  ).unsafeUnwrap().precinctId;
}

export async function setCurrentPrecinctId(
  precinctId?: Precinct['id']
): Promise<void> {
  if (!precinctId) {
    await del('/precinct-scanner/config/precinct');
  } else {
    await put<Scan.PutCurrentPrecinctConfigRequest>(
      '/precinct-scanner/config/precinct',
      {
        precinctId,
      }
    );
  }
}
