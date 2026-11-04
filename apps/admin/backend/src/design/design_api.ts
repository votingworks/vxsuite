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
import { err, ok, type Result, wrapException } from '@votingworks/basics';
import {
  buildElectionDesignMethods,
  type TtsEditsStore,
  createBlankElection,
  defaultBallotTemplate,
  defaultSystemSettings,
  type ElectionDesignMethods,
  generateId,
  prepareLoadedElection,
} from '@votingworks/design-backend';
import * as grout from '@votingworks/grout';

import { LogEventId, type Logger } from '@votingworks/logging';
import {
  type ElectionId,
  type StateCode,
  type SystemSettings,
} from '@votingworks/types';
import {
  createUsbDriveAdapter,
  findDriveByPurpose,
  type MultiUsbDrive,
} from '@votingworks/usb-drive';
import { constructAuthMachineState } from '../util/auth.js';
import { buildExporter } from '../util/exporter.js';
import type { Workspace } from '../util/workspace.js';
import type { DesignExporter } from './design_export.js';
import {
  englishOnlyStateFeatures,
  localJurisdiction,
} from './design_features.js';
import { getMachineDesignState } from './design_state.js';
import type { DesignExport, DesignStore } from './design_store.js';
import {
  OFFLINE_TEXT_TO_SPEECH_CLIENT,
  OFFLINE_TRANSLATION_CLIENT,
} from './offline_clients.js';

export type DesignStatus =
  | { status: 'ready'; stateCode: StateCode }
  | { status: 'unsupported-state'; jurisdiction: string };

export interface CurrentDesign {
  electionId: ElectionId;
  title: string;
  ballotsFinalizedAt: Date | null;
  export: DesignExport | null;
  activated: boolean;
}

class DesignAuthError extends grout.UserError {}

const READ_ONLY_METHOD_PATTERN = /^(get|list|tts|is)[A-Z]/;

const METHODS_ALLOWED_WHEN_FINALIZED = ['unfinalizeBallots', 'discardDesign'];

function supportedStateCode(): StateCode {
  const state = getMachineDesignState();
  if (state.status !== 'supported') {
    throw new DesignAuthError('design:unsupported-state');
  }
  return state.stateCode;
}

const UNSUPPORTED_TTS_EDITS: TtsEditsStore = {
  ttsEditsAll: () => Promise.resolve([]),
  ttsEditsGet: () => Promise.resolve(null),
  ttsEditsSet: () =>
    Promise.reject(new Error('Audio editing is not available in VxAdmin.')),
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildDesignApi({
  auth,
  workspace,
  store,
  logger,
  multiUsbDrive,
  designExporter,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  store: DesignStore;
  logger: Logger;
  multiUsbDrive: MultiUsbDrive;
  designExporter: DesignExporter;
}) {
  const usbDriveAdapter = createUsbDriveAdapter(multiUsbDrive, (drives) =>
    findDriveByPurpose(drives, 'data')
  );
  const translator = new GoogleCloudTranslator({
    translationClient: OFFLINE_TRANSLATION_CLIENT,
  });

  function isActivated(): boolean {
    return workspace.store.getCurrentElectionId() !== undefined;
  }

  function assertNoDesign(): void {
    if (store.getCurrentElectionId()) {
      throw new grout.UserError('design:already-exists');
    }
    if (isActivated()) {
      throw new grout.UserError('design:machine-configured');
    }
  }

  function insertDesign(
    election: Parameters<DesignStore['createElection']>[0]['election'],
    isMiCombinedBallotPrimary: boolean,
    systemSettings?: SystemSettings
  ): void {
    const jurisdiction = localJurisdiction(supportedStateCode());
    store.createElection({
      jurisdictionId: jurisdiction.id,
      stateFeatures: englishOnlyStateFeatures(jurisdiction.stateCode),
      election,
      isMiCombinedBallotPrimary,
      ballotTemplateId: defaultBallotTemplate(jurisdiction),
      systemSettings: systemSettings ?? defaultSystemSettings(jurisdiction),
    });
  }

  const sharedMethods = buildElectionDesignMethods({
    store,
    features: {
      getJurisdiction: () =>
        Promise.resolve(localJurisdiction(supportedStateCode())),
      getStateFeatures: () =>
        Promise.resolve(englishOnlyStateFeatures(supportedStateCode())),
    },
    translator,
    speechSynthesizer: new GoogleCloudSpeechSynthesizer({
      textToSpeechClient: OFFLINE_TEXT_TO_SPEECH_CLIENT,
    }),
    ttsEdits: UNSUPPORTED_TTS_EDITS,
  });

  const methods = {
    ...sharedMethods,

    async deleteElection(input: { electionId: ElectionId }): Promise<void> {
      store.deleteElection(input.electionId);
      await designExporter.clearFiles();
    },

    isElectionEditable(input: { electionId: ElectionId }): boolean {
      return !isActivated() && !store.getBallotsFinalizedAt(input.electionId);
    },

    getDesignStatus(): DesignStatus {
      const state = getMachineDesignState();
      return state.status === 'supported'
        ? { status: 'ready', stateCode: state.stateCode }
        : { status: 'unsupported-state', jurisdiction: state.jurisdiction };
    },

    getCurrentDesign(): CurrentDesign | null {
      const electionId = store.getCurrentElectionId();
      if (!electionId) return null;
      const { election, ballotsFinalizedAt } = store.getElection(electionId);
      return {
        electionId,
        title: election.title,
        ballotsFinalizedAt,
        export: store.getExport(electionId) ?? null,
        activated: isActivated(),
      };
    },

    createDesign(): ElectionId {
      assertNoDesign();
      const electionId = generateId();
      insertDesign(
        createBlankElection(
          electionId,
          localJurisdiction(supportedStateCode())
        ),
        false
      );
      return electionId;
    },

    async loadElectionPackage(input: {
      electionFilePath: string;
    }): Promise<Result<ElectionId, Error>> {
      assertNoDesign();
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
      try {
        const { election, isMiCombinedBallotPrimary } = prepareLoadedElection({
          upload: { format: 'vxf', electionFileContents },
          newId: generateId(),
          stateFeatures: englishOnlyStateFeatures(supportedStateCode()),
        });
        insertDesign(election, isMiCombinedBallotPrimary, systemSettings);
        return ok(election.id);
      } catch (error) {
        return wrapException(error);
      }
    },

    async discardDesign(): Promise<void> {
      const electionId = store.getCurrentElectionId();
      if (!electionId) return;
      store.deleteElection(electionId);
      await designExporter.clearFiles();
    },

    finalizeBallots(input: { electionId: ElectionId }): void {
      if (designExporter.isRunning()) {
        throw new grout.UserError('design:export-running');
      }
      store.setBallotsFinalizedAt({
        electionId: input.electionId,
        finalizedAt: new Date(),
      });
      designExporter.startExport(input.electionId, supportedStateCode());
    },

    async unfinalizeBallots(input: { electionId: ElectionId }): Promise<void> {
      if (designExporter.isRunning()) {
        throw new grout.UserError('design:export-running');
      }
      store.setBallotsFinalizedAt({
        electionId: input.electionId,
        finalizedAt: null,
      });
      store.clearExport(input.electionId);
      await designExporter.clearFiles();
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

  function requireSupportedState({ methodName }: { methodName: string }): void {
    if (methodName === 'getDesignStatus') return;
    supportedStateCode();
  }

  function requireEditableDesign({ methodName }: { methodName: string }): void {
    if (
      READ_ONLY_METHOD_PATTERN.test(methodName) ||
      methodName === 'saveProofToUsb'
    ) {
      return;
    }
    if (isActivated()) {
      throw new grout.UserError('design:activated');
    }
    const currentElectionId = store.getCurrentElectionId();
    if (
      currentElectionId &&
      store.getBallotsFinalizedAt(currentElectionId) &&
      !METHODS_ALLOWED_WHEN_FINALIZED.includes(methodName)
    ) {
      throw new grout.UserError('design:finalized');
    }
  }

  return grout.createApi(methods satisfies ElectionDesignMethods, {
    before: [
      requireSystemAdministrator,
      requireSupportedState,
      requireEditableDesign,
    ],
    after: [
      async ({ methodName, input }, result) => {
        if (READ_ONLY_METHOD_PATTERN.test(methodName)) return;
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
