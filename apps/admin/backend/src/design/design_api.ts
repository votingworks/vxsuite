import type { DippedSmartCardAuthApi } from '@votingworks/auth';
import {
  buildElectionDefinitionMethods,
  cloneElection,
  generateId,
  type ElectionListing,
  type MainExportTaskMetadata,
  getStateFeaturesConfig,
  type StateCode,
  StateCodeSchema,
  StateCodes,
  type StateFeaturesConfig,
  type Store as DesignStore,
} from '@votingworks/design-backend';
import * as grout from '@votingworks/grout';
import {
  type ElectionId,
  type SystemSettings,
  unsafeParse,
} from '@votingworks/types';
import { err, ok, type Result } from '@votingworks/basics';
import {
  type ElectionPackageError,
  type ExportDataError,
  readElectionPackageFromFile,
} from '@votingworks/backend';
import {
  createUsbDriveAdapter,
  findDriveByPurpose,
  type MultiUsbDrive,
} from '@votingworks/usb-drive';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { buildExporter } from '../util/exporter.js';
import { configureFromElectionPackageFile } from '../configure.js';
import type { DesignExporter } from './design_export.js';
import { LogEventId, type Logger } from '@votingworks/logging';
import { readFile } from 'node:fs/promises';
import type { Workspace } from '../util/workspace.js';
import { constructAuthMachineState } from '../util/auth.js';
import { getLocalJurisdiction, LOCAL_JURISDICTION_ID } from './design_store.js';

class DesignAuthError extends grout.UserError {}

function withEnglishOnlyFeatures(
  features: StateFeaturesConfig
): StateFeaturesConfig {
  return { ...features, AUDIO_ENABLED: false, BALLOT_LANGUAGE_CONFIG: false };
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildDesignApi({
  auth,
  workspace,
  designStore,
  logger,
  multiUsbDrive,
  designExporter,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  designStore: DesignStore;
  logger: Logger;
  multiUsbDrive: MultiUsbDrive;
  designExporter: DesignExporter;
}) {
  const usbDriveAdapter = createUsbDriveAdapter(multiUsbDrive, (drives) =>
    findDriveByPurpose(drives, 'data')
  );

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

  const electionDefinitionMethods = buildElectionDefinitionMethods({
    store: designStore,
  });

  const methods = {
    ...electionDefinitionMethods,

    async getStateFeatures(input: {
      electionId: ElectionId;
    }): Promise<StateFeaturesConfig> {
      return withEnglishOnlyFeatures(
        await electionDefinitionMethods.getStateFeatures(input)
      );
    },

    async getLocalJurisdictionId(): Promise<string> {
      return LOCAL_JURISDICTION_ID;
    },

    listStateCodes(): readonly StateCode[] {
      return StateCodes;
    },

    async getDesignStateCode(): Promise<StateCode> {
      return (await getLocalJurisdiction(designStore)).stateCode;
    },

    async setDesignStateCode(input: { stateCode: StateCode }): Promise<void> {
      await designStore.updateJurisdictionStateCode(
        LOCAL_JURISDICTION_ID,
        unsafeParse(StateCodeSchema, input.stateCode)
      );
    },

    async getLocalStateFeatures(): Promise<StateFeaturesConfig> {
      return withEnglishOnlyFeatures(
        getStateFeaturesConfig(await getLocalJurisdiction(designStore))
      );
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
        await designStore.updateSystemSettings(loadResult.ok(), systemSettings);
      }
      return loadResult;
    },

    getElectionPackage(input: {
      electionId: ElectionId;
    }): Promise<MainExportTaskMetadata> {
      return designStore.getElectionPackage(input.electionId);
    },

    async finalizeAndExportBallots(input: {
      electionId: ElectionId;
    }): Promise<void> {
      await designStore.setBallotsFinalizedAt({
        electionId: input.electionId,
        finalizedAt: new Date(),
      });
      await designExporter.startExport(input.electionId);
    },

    async unfinalizeBallots(input: { electionId: ElectionId }): Promise<void> {
      await designStore.setBallotsFinalizedAt({
        electionId: input.electionId,
        finalizedAt: null,
      });
    },

    async saveDesignExportToUsb(input: {
      electionId: ElectionId;
    }): Promise<Result<string[], ExportDataError | Error>> {
      const exported = await designStore.getElectionPackage(input.electionId);
      const urls = [
        exported.electionPackageUrl,
        exported.officialBallotsUrl,
        exported.sampleBallotsUrl,
        exported.testBallotsUrl,
      ].filter((url): url is string => !!url);
      if (!exported.electionPackageUrl) {
        return err(new Error('Ballots have not been exported yet.'));
      }
      const { title } = await designStore
        .getElection(input.electionId)
        .then((record) => record.election);
      const directory = join(
        'election-design',
        `${title.replace(/[^\w-]+/g, '-') || 'election'}-${input.electionId}`
      );
      const exporter = buildExporter(usbDriveAdapter);
      const savedFiles: string[] = [];
      for (const url of urls) {
        const filePath = designExporter.resolveFileUrl(url);
        const fileName = basename(filePath);
        const result = await exporter.exportDataToUsbDrive(
          directory,
          fileName,
          createReadStream(filePath),
          { size: (await stat(filePath)).size }
        );
        if (result.isErr()) return result;
        savedFiles.push(join(directory, fileName));
      }
      return ok(savedFiles);
    },

    async configureFromDesign(input: {
      electionId: ElectionId;
    }): Promise<Result<{ electionId: string }, ElectionPackageError | Error>> {
      if (workspace.store.getCurrentElectionId()) {
        return err(
          new Error(
            'VxAdmin is already configured. Unconfigure it before configuring from a design.'
          )
        );
      }
      const finalizedAt = await designStore.getBallotsFinalizedAt(
        input.electionId
      );
      const { task, electionPackageUrl } = await designStore.getElectionPackage(
        input.electionId
      );
      if (
        !finalizedAt ||
        !electionPackageUrl ||
        !task?.completedAt ||
        task.error ||
        task.createdAt < finalizedAt
      ) {
        return err(new Error('Finalize and export ballots first.'));
      }
      return configureFromElectionPackageFile({
        store: workspace.store,
        logger,
        electionPackageFilePath:
          designExporter.resolveFileUrl(electionPackageUrl),
      });
    },

    async duplicateElection(input: {
      electionId: ElectionId;
    }): Promise<ElectionId> {
      const destElectionId = generateId();
      await cloneElection(designStore, {
        sourceElectionId: input.electionId,
        destElectionId,
        destJurisdiction: await getLocalJurisdiction(designStore),
      });
      return destElectionId;
    },

    listElections(): Promise<ElectionListing[]> {
      return designStore.listElections({
        jurisdictionIds: [LOCAL_JURISDICTION_ID],
      });
    },
  } as const;

  return grout.createApi(methods, {
    before: [requireSystemAdministrator],
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
