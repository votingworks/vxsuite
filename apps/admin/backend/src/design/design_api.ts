import type { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { DippedSmartCardAuthApi } from '@votingworks/auth';
import {
  type ExportDataError,
  GoogleCloudSpeechSynthesizer,
  GoogleCloudTranslator,
  readElectionPackageFromFile,
} from '@votingworks/backend';
import { err, ok, type Result } from '@votingworks/basics';
import {
  buildBallotPreviewMethods,
  buildElectionDefinitionMethods,
  buildTtsMethods,
  cloneElection,
  type ElectionListing,
  generateId,
  type MainExportTaskMetadata,
  type StateFeaturesConfig,
  type TtsEditsStore,
} from '@votingworks/design-backend';
import * as grout from '@votingworks/grout';
import { LogEventId, type Logger } from '@votingworks/logging';
import type { ElectionId, StateCode, SystemSettings } from '@votingworks/types';
import {
  createUsbDriveAdapter,
  findDriveByPurpose,
  type MultiUsbDrive,
} from '@votingworks/usb-drive';
import { constructAuthMachineState } from '../util/auth.js';
import { buildExporter } from '../util/exporter.js';
import type { Workspace } from '../util/workspace.js';
import {
  type AdminDesignStores,
  LOCAL_JURISDICTION_ID,
  LOCAL_JURISDICTION_NAME,
  syncLocalJurisdiction,
} from './design_db.js';
import type { DesignExporter } from './design_export.js';
import {
  englishOnlyStateFeatures,
  localJurisdiction,
} from './design_features.js';
import { getMachineDesignState } from './design_state.js';
import {
  OFFLINE_TEXT_TO_SPEECH_CLIENT,
  OFFLINE_TRANSLATION_CLIENT,
} from './offline_clients.js';

export type DesignStatus =
  | { status: 'ready'; stateCode: StateCode }
  | { status: 'unsupported-state'; jurisdiction: string };

class DesignAuthError extends grout.UserError {}

const UNSUPPORTED_TTS_EDITS: TtsEditsStore = {
  ttsEditsAll: () => Promise.resolve([]),
  ttsEditsGet: () => Promise.resolve(null),
  ttsEditsSet: () =>
    Promise.reject(new Error('Audio editing is not available in VxAdmin.')),
};

function supportedStateCode(): StateCode {
  const state = getMachineDesignState();
  if (state.status !== 'supported') {
    throw new DesignAuthError('design:unsupported-state');
  }
  return state.stateCode;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildDesignApi({
  auth,
  workspace,
  stores,
  logger,
  multiUsbDrive,
  designExporter,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  stores: AdminDesignStores;
  logger: Logger;
  multiUsbDrive: MultiUsbDrive;
  designExporter: DesignExporter;
}) {
  const { elections, tasks } = stores;
  const usbDriveAdapter = createUsbDriveAdapter(multiUsbDrive, (drives) =>
    findDriveByPurpose(drives, 'data')
  );
  const features = {
    getJurisdiction: () =>
      Promise.resolve(localJurisdiction(supportedStateCode())),
    getStateFeatures: () =>
      Promise.resolve(englishOnlyStateFeatures(supportedStateCode())),
  };
  const translator = new GoogleCloudTranslator({
    translationClient: OFFLINE_TRANSLATION_CLIENT,
  });

  const electionDefinitionMethods = buildElectionDefinitionMethods({
    store: elections,
    features,
  });

  const methods = {
    ...electionDefinitionMethods,
    ...buildBallotPreviewMethods({ store: elections, translator }),
    ...buildTtsMethods({
      elections,
      ttsEdits: UNSUPPORTED_TTS_EDITS,
      speechSynthesizer: new GoogleCloudSpeechSynthesizer({
        textToSpeechClient: OFFLINE_TEXT_TO_SPEECH_CLIENT,
      }),
    }),

    getDesignStatus(): DesignStatus {
      const state = getMachineDesignState();
      return state.status === 'supported'
        ? { status: 'ready', stateCode: state.stateCode }
        : { status: 'unsupported-state', jurisdiction: state.jurisdiction };
    },

    getLocalJurisdictionId(): string {
      return LOCAL_JURISDICTION_ID;
    },

    getLocalStateFeatures(): StateFeaturesConfig {
      return englishOnlyStateFeatures(supportedStateCode());
    },

    async listElections(): Promise<ElectionListing[]> {
      const listings = await elections.listElections({
        jurisdictionIds: [LOCAL_JURISDICTION_ID],
      });
      return listings.map((listing) => ({
        ...listing,
        jurisdictionName: LOCAL_JURISDICTION_NAME,
      }));
    },

    async loadElectionPackage(input: {
      electionFilePath: string;
    }): Promise<Result<ElectionId, Error>> {
      let electionFileContents: string;
      let systemSettings: SystemSettings | undefined;
      if (input.electionFilePath.endsWith('.json')) {
        electionFileContents = await readFile(input.electionFilePath, 'utf8');
      } else {
        const electionPackageResult = await readElectionPackageFromFile(
          input.electionFilePath
        );
        if (electionPackageResult.isErr()) {
          return err(
            new Error(
              `Invalid election package: ${electionPackageResult.err().type}`
            )
          );
        }
        const { electionPackage } = electionPackageResult.ok();
        electionFileContents = electionPackage.electionDefinition.electionData;
        ({ systemSettings } = electionPackage);
      }
      const loadResult = await electionDefinitionMethods.loadElection({
        upload: { format: 'vxf', electionFileContents },
        newId: generateId(),
        jurisdictionId: LOCAL_JURISDICTION_ID,
      });
      if (loadResult.isOk() && systemSettings) {
        await elections.updateSystemSettings(loadResult.ok(), systemSettings);
      }
      return loadResult;
    },

    async duplicateElection(input: {
      electionId: ElectionId;
    }): Promise<ElectionId> {
      const destElectionId = generateId();
      await cloneElection(elections, {
        sourceElectionId: input.electionId,
        destElectionId,
        destJurisdiction: localJurisdiction(supportedStateCode()),
      });
      return destElectionId;
    },

    getElectionPackage(input: {
      electionId: ElectionId;
    }): Promise<MainExportTaskMetadata> {
      return tasks.getElectionPackage(input.electionId);
    },

    async finalizeAndExportBallots(input: {
      electionId: ElectionId;
    }): Promise<void> {
      await elections.setBallotsFinalizedAt({
        electionId: input.electionId,
        finalizedAt: new Date(),
      });
      await designExporter.startExport(input.electionId, supportedStateCode());
    },

    async unfinalizeBallots(input: { electionId: ElectionId }): Promise<void> {
      await elections.setBallotsFinalizedAt({
        electionId: input.electionId,
        finalizedAt: null,
      });
      await tasks.clearElectionPackageExport(input.electionId);
    },

    async saveProofToUsb(input: {
      fileName: string;
      data: Buffer;
    }): Promise<Result<string, ExportDataError>> {
      const fileName = basename(input.fileName);
      const directory = join('election-design', 'proofs');
      const result = await buildExporter(usbDriveAdapter).exportDataToUsbDrive(
        directory,
        fileName,
        input.data
      );
      return result.isOk() ? ok(join(directory, fileName)) : result;
    },
  } as const;

  async function requireSystemAdministrator(): Promise<void> {
    const authStatus = await auth.getAuthStatus(
      constructAuthMachineState(workspace.store)
    );
    if (
      authStatus.status !== 'logged_in' ||
      authStatus.user.role !== 'system_administrator'
    ) {
      throw new DesignAuthError('auth:forbidden');
    }
  }

  async function requireSupportedState({
    methodName,
  }: {
    methodName: string;
  }): Promise<void> {
    if (methodName === 'getDesignStatus') return;
    await syncLocalJurisdiction(stores.db, supportedStateCode());
  }

  return grout.createApi(methods, {
    before: [requireSystemAdministrator, requireSupportedState],
    after: [
      async ({ methodName, input }, result) => {
        if (/^(list|get)/.test(methodName)) return;
        await logger.logAsCurrentRole(LogEventId.ApiCall, {
          message: `Election design: ${methodName}`,
          methodName,
          input: JSON.stringify(input),
          disposition: result.isOk() ? 'success' : 'failure',
        });
      },
    ],
  });
}

export type DesignApi = ReturnType<typeof buildDesignApi>;
