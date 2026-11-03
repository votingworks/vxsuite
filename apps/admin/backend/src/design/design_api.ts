import type { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { DippedSmartCardAuthApi } from '@votingworks/auth';
import {
  type ExportDataError,
  GoogleCloudTranslator,
  readElectionPackageFromFile,
} from '@votingworks/backend';
import { err, ok, type Result, wrapException } from '@votingworks/basics';
import {
  type BallotPreviewInput,
  type BallotTemplateId,
  type BallotPreviewResult,
  createBlankElection,
  defaultBallotTemplate,
  defaultSystemSettings,
  type DuplicateContestError,
  type DuplicateDistrictError,
  type DuplicateElectionError,
  type DuplicatePartyError,
  type DuplicatePrecinctError,
  type ElectionDesignMethods,
  type ElectionInfo,
  type ElectionInfoUpdate,
  ElectionInfoUpdateSchema,
  generateId,
  prepareLoadedElection,
  renderBallotPreview,
  type SetPollingPlaceError,
  type StateFeaturesConfig,
  ttsStringDefaultsForElection,
  type TtsStringDefault,
} from '@votingworks/design-backend';
import * as grout from '@votingworks/grout';

import { LogEventId, type Logger } from '@votingworks/logging';
import {
  type BallotStyle,
  type Contest,
  ContestSchema,
  type District,
  type ElectionId,
  type ElectionRegisteredVoterCounts,
  getAllBallotLanguages,
  type HmpbBallotPaperSize,
  type Party,
  type PollingPlace,
  PollingPlaceSchema,
  type Precinct,
  type PrecinctId,
  type PrecinctRegisteredVoterCountEntry,
  PrecinctRegisteredVoterCountEntrySchema,
  PrecinctSchema,
  type StateCode,
  type SystemSettings,
  type TtsEdit,
  unsafeParse,
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
import { OFFLINE_TRANSLATION_CLIENT } from './offline_clients.js';

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

const READ_ONLY_METHOD_PATTERN = /^(get|list|tts)/;

const METHODS_ALLOWED_WHEN_FINALIZED = ['unfinalizeBallots', 'discardDesign'];

function supportedStateCode(): StateCode {
  const state = getMachineDesignState();
  if (state.status !== 'supported') {
    throw new DesignAuthError('design:unsupported-state');
  }
  return state.stateCode;
}

function parseRegisteredVoterCounts(
  counts?: PrecinctRegisteredVoterCountEntry
): PrecinctRegisteredVoterCountEntry | undefined {
  return counts !== undefined
    ? unsafeParse(PrecinctRegisteredVoterCountEntrySchema, counts)
    : undefined;
}

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
      stateFeatures: englishOnlyStateFeatures(jurisdiction.stateCode),
      election,
      isMiCombinedBallotPrimary,
      ballotTemplateId: defaultBallotTemplate(jurisdiction),
      systemSettings: systemSettings ?? defaultSystemSettings(jurisdiction),
    });
  }

  const sharedMethods = {
    getElectionInfo(input: { electionId: ElectionId }): ElectionInfo {
      const {
        election,
        isMiCombinedBallotPrimary,
        ballotLanguageConfigs,
        jurisdictionId,
        externalSource,
      } = store.getElection(input.electionId);
      return {
        jurisdictionId,
        electionId: election.id,
        title: election.title,
        date: election.date,
        type: election.type,
        isMiCombinedBallotPrimary,
        state: election.state,
        jurisdictionName: election.jurisdiction.name,
        seal: election.seal,
        signatureImage: election.signature?.image,
        signatureCaption: election.signature?.caption,
        languageCodes: getAllBallotLanguages(ballotLanguageConfigs),
        externalSource,
      };
    },

    updateElectionInfo(
      input: ElectionInfoUpdate
    ): Result<void, DuplicateElectionError> {
      return store.updateElectionInfo(
        unsafeParse(ElectionInfoUpdateSchema, input)
      );
    },

    async deleteElection(input: { electionId: ElectionId }): Promise<void> {
      store.deleteElection(input.electionId);
      await designExporter.clearFiles();
    },

    listDistricts(input: { electionId: ElectionId }): readonly District[] {
      return store.listDistricts(input.electionId);
    },

    updateDistricts(input: {
      electionId: ElectionId;
      deletedDistrictIds?: string[];
      newDistricts?: District[];
      updatedDistricts?: District[];
    }): Result<void, DuplicateDistrictError> {
      return store.updateDistricts(input);
    },

    listPrecincts(input: { electionId: ElectionId }): readonly Precinct[] {
      return store.listPrecincts(input.electionId);
    },

    createPrecinct(input: {
      electionId: ElectionId;
      newPrecinct: Precinct;
      registeredVoterCounts?: PrecinctRegisteredVoterCountEntry;
    }): Result<void, DuplicatePrecinctError> {
      const precinct = unsafeParse(PrecinctSchema, input.newPrecinct);
      const result = store.createPrecinct(input.electionId, precinct);
      if (result.isErr()) return result;
      store.setPrecinctRegisteredVoterCounts(
        precinct,
        parseRegisteredVoterCounts(input.registeredVoterCounts)
      );
      return ok();
    },

    updatePrecinct(input: {
      electionId: ElectionId;
      updatedPrecinct: Precinct;
      registeredVoterCounts?: PrecinctRegisteredVoterCountEntry;
    }): Result<void, DuplicatePrecinctError> {
      const precinct = unsafeParse(PrecinctSchema, input.updatedPrecinct);
      const result = store.updatePrecinct(input.electionId, precinct);
      if (result.isErr()) return result;
      store.setPrecinctRegisteredVoterCounts(
        precinct,
        parseRegisteredVoterCounts(input.registeredVoterCounts)
      );
      return ok();
    },

    deletePrecinct(input: {
      electionId: ElectionId;
      precinctId: PrecinctId;
    }): void {
      store.deletePrecinct(input.electionId, input.precinctId);
    },

    getRegisteredVoterCounts(input: {
      electionId: ElectionId;
    }): ElectionRegisteredVoterCounts {
      return store.getRegisteredVoterCounts(input.electionId);
    },

    listPollingPlaces(input: { electionId: string }): PollingPlace[] {
      return store.listPollingPlaces(input.electionId);
    },

    setPollingPlace(input: {
      electionId: ElectionId;
      place: PollingPlace;
    }): Result<void, SetPollingPlaceError> {
      return store.setPollingPlace(
        input.electionId,
        unsafeParse(PollingPlaceSchema, input.place)
      );
    },

    deletePollingPlace(input: { electionId: string; id: string }): void {
      store.deletePollingPlace(input);
    },

    listParties(input: { electionId: ElectionId }): readonly Party[] {
      return store.listParties(input.electionId);
    },

    updateParties(input: {
      electionId: ElectionId;
      deletedPartyIds?: string[];
      newParties?: Party[];
      updatedParties?: Party[];
    }): Result<void, DuplicatePartyError> {
      return store.updateParties(input);
    },

    listContests(input: { electionId: ElectionId }): readonly Contest[] {
      return store.listContests(input.electionId);
    },

    createContest(input: {
      electionId: ElectionId;
      newContest: Contest;
    }): Result<void, DuplicateContestError> {
      return store.createContest(
        input.electionId,
        unsafeParse(ContestSchema, input.newContest)
      );
    },

    updateContest(input: {
      electionId: ElectionId;
      updatedContest: Contest;
    }): Result<void, DuplicateContestError> {
      return store.updateContest(
        input.electionId,
        unsafeParse(ContestSchema, input.updatedContest)
      );
    },

    reorderContests(input: {
      electionId: ElectionId;
      contestIds: string[];
    }): void {
      store.reorderContests(input.electionId, input.contestIds);
    },

    deleteContest(input: { electionId: ElectionId; contestId: string }): void {
      store.deleteContest(input.electionId, input.contestId);
    },

    listBallotStyles(input: {
      electionId: ElectionId;
    }): readonly BallotStyle[] {
      return store.listBallotStyles(input.electionId);
    },

    getBallotLayoutSettings(input: { electionId: ElectionId }): {
      paperSize: HmpbBallotPaperSize;
      compact: boolean;
    } {
      return store.getBallotLayoutSettings(input.electionId);
    },

    getBallotTemplate(input: { electionId: ElectionId }): BallotTemplateId {
      return store.getBallotTemplate(input.electionId);
    },

    getBallotsFinalizedAt(input: { electionId: ElectionId }): Date | null {
      return store.getBallotsFinalizedAt(input.electionId);
    },

    getBallotPreviewPdf(
      input: BallotPreviewInput
    ): Promise<BallotPreviewResult> {
      return renderBallotPreview({
        electionRecord: store.getElection(input.electionId),
        compact: store.getBallotLayoutSettings(input.electionId).compact,
        translator,
        input,
      });
    },

    getStateFeatures(): StateFeaturesConfig {
      return englishOnlyStateFeatures(supportedStateCode());
    },

    ttsEditsGet(): TtsEdit | null {
      return null;
    },

    ttsEditsSet(): void {
      throw new Error('Audio editing is not available in VxAdmin.');
    },

    ttsStringDefaults(input: { electionId: string }): TtsStringDefault[] {
      return ttsStringDefaultsForElection(
        store.getElection(input.electionId).election
      );
    },

    ttsSynthesizeFromText(): string {
      throw new Error('Speech synthesis is not available in VxAdmin.');
    },
  } as const;

  const methods = {
    ...sharedMethods,

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
