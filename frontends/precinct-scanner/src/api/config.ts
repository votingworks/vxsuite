import {
  ElectionDefinition,
  Optional,
  MarkThresholds,
  safeParseJson,
  PrecinctSelection,
  PollsState,
} from '@votingworks/types';
import { ErrorsResponse, OkResponse, Scan } from '@votingworks/api';
import { BallotPackage, BallotPackageEntry, assert } from '@votingworks/utils';
import { EventEmitter } from 'events';

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

export async function getPrecinctSelection(): Promise<
  Optional<PrecinctSelection>
> {
  return safeParseJson(
    await (
      await fetch('/precinct-scanner/config/precinct', {
        headers: { Accept: 'application/json' },
      })
    ).text(),
    Scan.GetPrecinctSelectionConfigResponseSchema
  ).unsafeUnwrap().precinctSelection;
}

export async function setPrecinctSelection(
  precinctSelection: PrecinctSelection
): Promise<void> {
  await put<Scan.PutPrecinctSelectionConfigRequest>(
    '/precinct-scanner/config/precinct',
    {
      precinctSelection,
    }
  );
}

export async function getPollsState(): Promise<PollsState> {
  return safeParseJson(
    await (
      await fetch('/precinct-scanner/config/polls', {
        headers: { Accept: 'application/json' },
      })
    ).text(),
    Scan.GetPollsStateConfigResponseSchema
  ).unsafeUnwrap().pollsState;
}

export async function setPollsState(pollsState: PollsState): Promise<void> {
  await put<Scan.PutPollsStateConfigRequest>('/precinct-scanner/config/polls', {
    pollsState,
  });
}

export interface AddTemplatesEvents extends EventEmitter {
  on(
    event: 'configuring',
    callback: (
      pkg: BallotPackage,
      electionDefinition: ElectionDefinition
    ) => void
  ): this;
  on(
    event: 'uploading',
    callback: (pkg: BallotPackage, entry: BallotPackageEntry) => void
  ): this;
  on(event: 'completed', callback: (pkg: BallotPackage) => void): this;
  on(event: 'error', callback: (error: Error) => void): this;
  off(
    event: 'configuring',
    callback: (
      pkg: BallotPackage,
      electionDefinition: ElectionDefinition
    ) => void
  ): this;
  off(
    event: 'uploading',
    callback: (pkg: BallotPackage, entry: BallotPackageEntry) => void
  ): this;
  off(event: 'completed', callback: (pkg: BallotPackage) => void): this;
  off(event: 'error', callback: (error: Error) => void): this;
  emit(
    event: 'configuring',
    pkg: BallotPackage,
    electionDefinition: ElectionDefinition
  ): boolean;
  emit(
    event: 'uploading',
    pkg: BallotPackage,
    entry: BallotPackageEntry
  ): boolean;
  emit(event: 'completed', pkg: BallotPackage): boolean;
  emit(event: 'error', error: Error): boolean;
}

export function addTemplates(pkg: BallotPackage): AddTemplatesEvents {
  const result: AddTemplatesEvents = new EventEmitter();

  setImmediate(async () => {
    try {
      result.emit('configuring', pkg, pkg.electionDefinition);
      await setElection(pkg.electionDefinition.electionData);

      for (const ballot of pkg.ballots) {
        result.emit('uploading', pkg, ballot);

        const body = new FormData();

        body.append(
          'ballots',
          new Blob([ballot.pdf], { type: 'application/pdf' }),
          ballot.ballotConfig.filename
        );

        body.append(
          'metadatas',
          new Blob([JSON.stringify(ballot.ballotConfig)], {
            type: 'application/json',
          }),
          'ballot-config.json'
        );

        if (ballot.layout) {
          body.append(
            'layouts',
            new Blob([JSON.stringify(ballot.layout)], {
              type: 'application/json',
            }),
            ballot.ballotConfig.layoutFilename
          );
        }

        await fetch('/precinct-scanner/config/addTemplates', {
          method: 'POST',
          body,
        });
      }

      result.emit('completed', pkg);
    } catch (error) {
      assert(error instanceof Error);
      result.emit('error', error);
    }
  });

  return result;
}
