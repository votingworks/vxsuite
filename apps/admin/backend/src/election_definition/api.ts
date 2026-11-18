import type { DippedSmartCardAuthApi } from '@votingworks/auth';
import type { ExportDataResult } from '@votingworks/backend';
import {
  assert,
  assertDefined,
  DateWithoutTime,
  ok,
  type Result,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  type BallotLayoutSettings,
  type BallotLayoutSettingsUpdate,
  type ContestCreate,
  type ContestDelete,
  type ContestsReorder,
  type ContestUpdate,
  type DistrictsUpdate,
  type DuplicateContestError,
  type DuplicateDistrictError,
  type DuplicatePartyError,
  type DuplicatePrecinctError,
  type ElectionDefinitionMethods,
  type ElectionInfo,
  type ElectionInfoUpdate,
  ElectionInfoUpdateSchema,
  type ElectionInput,
  generateId,
  type PartiesUpdate,
  type PollingPlaceDelete,
  type PollingPlaceSet,
  type PrecinctCreate,
  type PrecinctDelete,
  type PrecinctUpdate,
  type SetPollingPlaceError,
  type StateCode,
  type StateFeaturesConfig,
} from '@votingworks/election-definition-backend';
import * as grout from '@votingworks/grout';
import {
  type BallotLayoutError,
  type BallotPreviewPdf,
  type BallotPreviewSpec,
  createPlaywrightRenderer,
  renderBallotPreview,
} from '@votingworks/hmpb';
import { LogEventId, type Logger } from '@votingworks/logging';
import {
  type BallotStyle,
  type District,
  type Contest,
  type ElectionId,
  type ElectionRegisteredVoterCounts,
  HmpbBallotPaperSizeSchema,
  LanguageCode,
  type NonEnglishLanguageCode,
  type Party,
  type PollingPlace,
  pollingPlaceGenerateFromPrecinct,
  type Precinct,
  unsafeParse,
} from '@votingworks/types';
import { type Printer, PrintSides } from '@votingworks/printing';
import type { UsbDrive } from '@votingworks/usb-drive';
import { isSystemAdministratorAuth } from '@votingworks/utils';
import { z } from 'zod/v4';
import { constructAuthMachineState } from '../util/auth.js';
import { buildExporter } from '../util/exporter.js';
import type { Workspace } from '../util/workspace.js';
import { createEnglishOnlyTranslator } from './english_only_translator.js';
import {
  createFinalizeMockup,
  type FinalizedBallotsKind,
  type FinalizeStatus,
} from './finalize_mockup.js';
import { getMachineState, isElectionDefinitionEnabled } from './state.js';
import {
  exportTranslations,
  importTranslations,
  type TranslationsImportError,
} from './translations.js';

function blankElectionInfo(
  electionId: ElectionId,
  stateCode: StateCode
): ElectionInfoUpdate {
  return {
    electionId,
    type: 'general',
    date: DateWithoutTime.today(),
    title: '',
    state: stateCode,
    jurisdictionName: '',
    seal: '',
    languageCodes: [LanguageCode.ENGLISH],
  };
}

function describePartyError({ code, partyId }: DuplicatePartyError): string {
  switch (code) {
    case 'duplicate-name':
      return `party ${partyId} has a duplicate short name`;
    case 'duplicate-full-name':
      return `party ${partyId} has a duplicate full name`;
    case 'duplicate-abbrev':
      return `party ${partyId} has a duplicate abbreviation`;
    case 'duplicate-contest':
      return `deleting party ${partyId} would make two contests the same`;
    default:
      throwIllegalValue(code);
  }
}

function describeContestError(
  error: DuplicateContestError,
  contest: Contest
): string {
  switch (error) {
    case 'duplicate-contest':
      return contest.type === 'yesno'
        ? 'another contest has the same district and title'
        : 'another contest has the same district, title, seats, term and party';
    case 'duplicate-candidate':
      return 'two of its candidates have the same name';
    case 'duplicate-option':
      return 'two of its options have the same label';
    default:
      throwIllegalValue(error);
  }
}

function describePrecinctError(error: DuplicatePrecinctError): string {
  switch (error) {
    case 'duplicate-precinct-name':
      return 'another precinct has the same name';
    case 'duplicate-split-name':
      return 'two of its splits have the same name';
    case 'duplicate-split-districts':
      return 'two of its splits have the same districts';
    default:
      throwIllegalValue(error);
  }
}

function describePollingPlaceError(error: SetPollingPlaceError): string {
  switch (error) {
    case 'duplicate-name':
      return 'another polling place of the same type has the same name';
    case 'invalid-precinct':
      return 'one of its precincts is not in the election';
    default:
      throwIllegalValue(error);
  }
}

async function requireElectionDefinitionAccess({
  auth,
  workspace,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
}): Promise<void> {
  if (!isElectionDefinitionEnabled()) {
    throw new grout.UserError('election-definition:disabled');
  }
  const authStatus = await auth.getAuthStatus(
    constructAuthMachineState(workspace.store)
  );
  if (!isSystemAdministratorAuth(authStatus)) {
    throw new grout.UserError('auth:forbidden');
  }
}

type BallotPreviewInput = ElectionInput & BallotPreviewSpec;

function createElectionDefinitionApiMethods({
  workspace,
  logger,
  usbDrive,
  printer,
}: {
  workspace: Workspace;
  logger: Logger;
  usbDrive: UsbDrive;
  printer: Printer;
}) {
  const { store } = workspace;
  const finalizeMockup = createFinalizeMockup();

  function describeProof(input: BallotPreviewInput): string {
    return `${input.ballotMode} ${input.ballotType} ballot proof for ballot style ${input.ballotStyleId} and precinct ${input.precinctId} in election definition ${input.electionId}`;
  }

  async function renderProof(
    input: BallotPreviewInput
  ): Promise<Result<BallotPreviewPdf, BallotLayoutError>> {
    const electionInfo = loadInProgressElectionInfo(input);
    const { election, candidateOrderings } = assertDefined(
      store.electionDefinition.getElectionWithCandidateOrderings(
        input.electionId
      )
    );
    return renderBallotPreview({
      election,
      ballotLanguageConfigs: electionInfo.languageCodes.map((languageCode) => ({
        languages: [languageCode],
      })),
      ballotTemplateId: 'VxDefaultBallot',
      getCandidateOrderings: (ballotStyle) =>
        assertDefined(candidateOrderings.get(ballotStyle.groupId)),
      compact: store.electionDefinition.getBallotLayoutSettings(
        input.electionId
      ).compact,
      translator: createEnglishOnlyTranslator(),
      createRenderer: createPlaywrightRenderer,
      spec: input,
    });
  }

  function loadInProgressElectionInfo(input: ElectionInput): ElectionInfo {
    const electionInfo = store.electionDefinition.getElectionInfo();
    assert(
      electionInfo?.electionId === input.electionId,
      'Election definition not found'
    );
    return electionInfo;
  }

  const methods = {
    getCurrentInProgressElection(): ElectionInfo | null {
      return store.electionDefinition.getElectionInfo() ?? null;
    },

    async createInProgressElection(): Promise<ElectionId> {
      const electionId = generateId();
      const { stateCode } = assertDefined(getMachineState());
      assert(
        store.getCurrentElectionId() === undefined,
        'Cannot create an election definition while an election is configured.'
      );
      assert(
        store.electionDefinition.getElectionInfo() === undefined,
        'An election definition already exists.'
      );
      store.electionDefinition.createInProgressElection(
        blankElectionInfo(electionId, stateCode)
      );
      await logger.logAsCurrentRole(LogEventId.ElectionDefinitionCreated, {
        message: `Created election definition ${electionId}.`,
        disposition: 'success',
      });
      return electionId;
    },

    async deleteElection(input: ElectionInput): Promise<void> {
      loadInProgressElectionInfo(input);
      store.electionDefinition.deleteInProgressElection();
      finalizeMockup.reset();
      await logger.logAsCurrentRole(LogEventId.ElectionDefinitionDiscarded, {
        message: `Discarded election definition ${input.electionId}.`,
        disposition: 'success',
      });
    },

    getElectionInfo(input: ElectionInput): ElectionInfo {
      return loadInProgressElectionInfo(input);
    },

    async updateElectionInfo(
      input: ElectionInfoUpdate
    ): Promise<Result<void, never>> {
      const electionInfoUpdate = unsafeParse(ElectionInfoUpdateSchema, input);
      assert(
        !electionInfoUpdate.isMiCombinedBallotPrimary,
        'Combined ballot primaries are not supported.'
      );
      loadInProgressElectionInfo(electionInfoUpdate);
      store.electionDefinition.updateInProgressElectionInfo(electionInfoUpdate);
      await logger.logAsCurrentRole(LogEventId.ElectionDefinitionInfoUpdated, {
        message: `Updated election info for election definition ${input.electionId}.`,
        disposition: 'success',
      });
      return ok();
    },

    getStateFeatures(input: ElectionInput): StateFeaturesConfig {
      loadInProgressElectionInfo(input);
      return assertDefined(getMachineState()).features;
    },

    listDistricts(input: ElectionInput): District[] {
      loadInProgressElectionInfo(input);
      return store.electionDefinition.listDistricts(input.electionId);
    },

    async updateDistricts(
      input: DistrictsUpdate
    ): Promise<Result<void, DuplicateDistrictError>> {
      loadInProgressElectionInfo(input);
      const result = store.electionDefinition.updateDistricts(input);
      if (result.isErr()) {
        await logger.logAsCurrentRole(
          LogEventId.ElectionDefinitionDistrictsUpdated,
          {
            message: `Error updating districts for election definition ${input.electionId}: district ${result.err().districtId} has a duplicate name.`,
            disposition: 'failure',
          }
        );
        return result;
      }
      await logger.logAsCurrentRole(
        LogEventId.ElectionDefinitionDistrictsUpdated,
        {
          message: `Updated districts for election definition ${input.electionId}.`,
          disposition: 'success',
        }
      );
      return result;
    },

    listParties(input: ElectionInput): Party[] {
      loadInProgressElectionInfo(input);
      return store.electionDefinition.listParties(input.electionId);
    },

    async updateParties(
      input: PartiesUpdate
    ): Promise<Result<void, DuplicatePartyError>> {
      loadInProgressElectionInfo(input);
      const result = store.electionDefinition.updateParties(input);
      if (result.isErr()) {
        await logger.logAsCurrentRole(
          LogEventId.ElectionDefinitionPartiesUpdated,
          {
            message: `Error updating parties for election definition ${input.electionId}: ${describePartyError(result.err())}.`,
            disposition: 'failure',
          }
        );
        return result;
      }
      await logger.logAsCurrentRole(
        LogEventId.ElectionDefinitionPartiesUpdated,
        {
          message: `Updated parties for election definition ${input.electionId}.`,
          disposition: 'success',
        }
      );
      return result;
    },

    listContests(input: ElectionInput): Contest[] {
      loadInProgressElectionInfo(input);
      return store.electionDefinition.listContests(input.electionId);
    },

    async createContest(
      input: ContestCreate
    ): Promise<Result<void, DuplicateContestError>> {
      loadInProgressElectionInfo(input);
      const result = store.electionDefinition.createContest(input);
      if (result.isErr()) {
        await logger.logAsCurrentRole(
          LogEventId.ElectionDefinitionContestCreated,
          {
            message: `Error creating contest ${input.newContest.id} in election definition ${input.electionId}: ${describeContestError(result.err(), input.newContest)}.`,
            disposition: 'failure',
          }
        );
        return result;
      }
      await logger.logAsCurrentRole(
        LogEventId.ElectionDefinitionContestCreated,
        {
          message: `Created contest ${input.newContest.id} in election definition ${input.electionId}.`,
          disposition: 'success',
        }
      );
      return result;
    },

    async updateContest(
      input: ContestUpdate
    ): Promise<Result<void, DuplicateContestError>> {
      loadInProgressElectionInfo(input);
      const result = store.electionDefinition.updateContest(input);
      if (result.isErr()) {
        await logger.logAsCurrentRole(
          LogEventId.ElectionDefinitionContestUpdated,
          {
            message: `Error updating contest ${input.updatedContest.id} in election definition ${input.electionId}: ${describeContestError(result.err(), input.updatedContest)}.`,
            disposition: 'failure',
          }
        );
        return result;
      }
      await logger.logAsCurrentRole(
        LogEventId.ElectionDefinitionContestUpdated,
        {
          message: `Updated contest ${input.updatedContest.id} in election definition ${input.electionId}.`,
          disposition: 'success',
        }
      );
      return result;
    },

    async reorderContests(input: ContestsReorder): Promise<void> {
      loadInProgressElectionInfo(input);
      store.electionDefinition.reorderContests(input);
      await logger.logAsCurrentRole(
        LogEventId.ElectionDefinitionContestsReordered,
        {
          message: `Reordered contests in election definition ${input.electionId}.`,
          disposition: 'success',
        }
      );
    },

    async deleteContest(input: ContestDelete): Promise<void> {
      loadInProgressElectionInfo(input);
      store.electionDefinition.deleteContest(input);
      await logger.logAsCurrentRole(
        LogEventId.ElectionDefinitionContestDeleted,
        {
          message: `Deleted contest ${input.contestId} from election definition ${input.electionId}.`,
          disposition: 'success',
        }
      );
    },

    listPrecincts(input: ElectionInput): Precinct[] {
      loadInProgressElectionInfo(input);
      return store.electionDefinition.listPrecincts(input.electionId);
    },

    async createPrecinct(
      input: PrecinctCreate
    ): Promise<Result<void, DuplicatePrecinctError>> {
      loadInProgressElectionInfo(input);
      const { features } = assertDefined(getMachineState());
      const result = store.electionDefinition.createPrecinct(
        input,
        features.EDIT_POLLING_PLACES
          ? pollingPlaceGenerateFromPrecinct({
              id: generateId(),
              precinct: input.newPrecinct,
              type: 'election_day',
            })
          : undefined
      );
      if (result.isErr()) {
        await logger.logAsCurrentRole(
          LogEventId.ElectionDefinitionPrecinctCreated,
          {
            message: `Error creating precinct ${input.newPrecinct.id} in election definition ${input.electionId}: ${describePrecinctError(result.err())}.`,
            disposition: 'failure',
          }
        );
        return result;
      }
      await logger.logAsCurrentRole(
        LogEventId.ElectionDefinitionPrecinctCreated,
        {
          message: `Created precinct ${input.newPrecinct.id} in election definition ${input.electionId}.`,
          disposition: 'success',
        }
      );
      return result;
    },

    async updatePrecinct(
      input: PrecinctUpdate
    ): Promise<Result<void, DuplicatePrecinctError>> {
      loadInProgressElectionInfo(input);
      const result = store.electionDefinition.updatePrecinct(input);
      if (result.isErr()) {
        await logger.logAsCurrentRole(
          LogEventId.ElectionDefinitionPrecinctUpdated,
          {
            message: `Error updating precinct ${input.updatedPrecinct.id} in election definition ${input.electionId}: ${describePrecinctError(result.err())}.`,
            disposition: 'failure',
          }
        );
        return result;
      }
      await logger.logAsCurrentRole(
        LogEventId.ElectionDefinitionPrecinctUpdated,
        {
          message: `Updated precinct ${input.updatedPrecinct.id} in election definition ${input.electionId}.`,
          disposition: 'success',
        }
      );
      return result;
    },

    async deletePrecinct(input: PrecinctDelete): Promise<void> {
      loadInProgressElectionInfo(input);
      store.electionDefinition.deletePrecinct(input);
      await logger.logAsCurrentRole(
        LogEventId.ElectionDefinitionPrecinctDeleted,
        {
          message: `Deleted precinct ${input.precinctId} from election definition ${input.electionId}.`,
          disposition: 'success',
        }
      );
    },

    getRegisteredVoterCounts(
      input: ElectionInput
    ): ElectionRegisteredVoterCounts {
      loadInProgressElectionInfo(input);
      return store.electionDefinition.getRegisteredVoterCounts(
        input.electionId
      );
    },

    listPollingPlaces(input: ElectionInput): PollingPlace[] {
      loadInProgressElectionInfo(input);
      return store.electionDefinition.listPollingPlaces(input.electionId);
    },

    async setPollingPlace(
      input: PollingPlaceSet
    ): Promise<Result<void, SetPollingPlaceError>> {
      loadInProgressElectionInfo(input);
      const result = store.electionDefinition.setPollingPlace(input);
      if (result.isErr()) {
        await logger.logAsCurrentRole(
          LogEventId.ElectionDefinitionPollingPlaceSaved,
          {
            message: `Error saving polling place ${input.place.id} in election definition ${input.electionId}: ${describePollingPlaceError(result.err())}.`,
            disposition: 'failure',
          }
        );
        return result;
      }
      await logger.logAsCurrentRole(
        LogEventId.ElectionDefinitionPollingPlaceSaved,
        {
          message: `Saved polling place ${input.place.id} in election definition ${input.electionId}.`,
          disposition: 'success',
        }
      );
      return result;
    },

    async deletePollingPlace(input: PollingPlaceDelete): Promise<void> {
      loadInProgressElectionInfo(input);
      store.electionDefinition.deletePollingPlace(input);
      await logger.logAsCurrentRole(
        LogEventId.ElectionDefinitionPollingPlaceDeleted,
        {
          message: `Deleted polling place ${input.id} from election definition ${input.electionId}.`,
          disposition: 'success',
        }
      );
    },

    listBallotStyles(input: ElectionInput): BallotStyle[] {
      loadInProgressElectionInfo(input);
      return store.electionDefinition.listBallotStyles(input.electionId);
    },

    getBallotLayoutSettings(input: ElectionInput): BallotLayoutSettings {
      loadInProgressElectionInfo(input);
      return store.electionDefinition.getBallotLayoutSettings(input.electionId);
    },

    async updateBallotLayoutSettings(
      input: BallotLayoutSettingsUpdate
    ): Promise<void> {
      loadInProgressElectionInfo(input);
      const paperSize = unsafeParse(HmpbBallotPaperSizeSchema, input.paperSize);
      const compact = unsafeParse(z.boolean(), input.compact);
      store.electionDefinition.updateBallotLayoutSettings({
        electionId: input.electionId,
        paperSize,
        compact,
      });
      await logger.logAsCurrentRole(
        LogEventId.ElectionDefinitionBallotLayoutSettingsUpdated,
        {
          message: `Updated ballot layout settings in election definition ${input.electionId}: paper size ${paperSize}, ${compact ? 'compact' : 'default'} density.`,
          disposition: 'success',
        }
      );
    },

    async getBallotPreviewPdf(
      input: BallotPreviewInput
    ): Promise<Result<BallotPreviewPdf, BallotLayoutError>> {
      const result = await renderProof(input);
      await logger.logAsCurrentRole(
        LogEventId.ElectionDefinitionBallotProofViewed,
        result.isOk()
          ? {
              message: `Viewed ${describeProof(input)}.`,
              disposition: 'success',
            }
          : {
              message: `Error rendering ${describeProof(input)}: ${result.err().error}`,
              disposition: 'failure',
            }
      );
      return result;
    },

    async printBallotPreviewPdf(input: BallotPreviewInput): Promise<void> {
      try {
        const result = await renderProof(input);
        assert(result.isOk(), 'Ballot proof could not be rendered');
        await printer.print({
          data: result.ok().pdfData,
          size: store.electionDefinition.getBallotLayoutSettings(
            input.electionId
          ).paperSize,
          sides: PrintSides.TwoSidedLongEdge,
        });
        await logger.logAsCurrentRole(
          LogEventId.ElectionDefinitionBallotProofPrinted,
          {
            message: `Printed ${describeProof(input)}.`,
            disposition: 'success',
          }
        );
      } catch (error) {
        assert(error instanceof Error);
        await logger.logAsCurrentRole(
          LogEventId.ElectionDefinitionBallotProofPrinted,
          {
            message: `Error printing ${describeProof(input)}: ${error.message}`,
            disposition: 'failure',
          }
        );
      }
    },

    async saveBallotPreviewPdf(
      input: BallotPreviewInput & { filename: string }
    ): Promise<ExportDataResult> {
      const result = await renderProof(input);
      assert(result.isOk(), 'Ballot proof could not be rendered');
      const exportResult = await buildExporter(usbDrive).exportDataToUsbDrive(
        '',
        input.filename,
        result.ok().pdfData
      );
      await logger.logAsCurrentRole(LogEventId.FileSaved, {
        disposition: exportResult.isOk() ? 'success' : 'failure',
        message: `${
          exportResult.isOk() ? 'Saved' : 'Failed to save'
        } ${describeProof(input)} to ${input.filename} on the USB drive.`,
        path: input.filename,
      });
      return exportResult;
    },

    getFinalizeStatus(input: ElectionInput): FinalizeStatus {
      loadInProgressElectionInfo(input);
      return finalizeMockup.getStatus(input.electionId);
    },

    finalizeElection(input: ElectionInput): void {
      loadInProgressElectionInfo(input);
      finalizeMockup.start(
        input.electionId,
        store.electionDefinition.listBallotStyles(input.electionId)
      );
    },

    unfinalizeElection(input: ElectionInput): void {
      loadInProgressElectionInfo(input);
      const finalizeStatus = finalizeMockup.getStatus(input.electionId);
      assert(
        finalizeStatus.status === 'finalized' && !finalizeStatus.hasResultsData,
        'Election definition cannot be unfinalized'
      );
      finalizeMockup.reset();
    },

    async saveFinalizedBallots(
      input: ElectionInput & { kind: FinalizedBallotsKind; filename: string }
    ): Promise<ExportDataResult> {
      loadInProgressElectionInfo(input);
      assert(
        finalizeMockup.getStatus(input.electionId).status === 'finalized',
        'Election definition is not finalized'
      );
      const exportResult = await buildExporter(usbDrive).exportDataToUsbDrive(
        '',
        input.filename,
        `Mockup ${input.kind} ballots for election definition ${input.electionId}.\n`
      );
      await logger.logAsCurrentRole(LogEventId.FileSaved, {
        disposition: exportResult.isOk() ? 'success' : 'failure',
        message: `${
          exportResult.isOk() ? 'Saved' : 'Failed to save'
        } ${input.kind} ballots for election definition ${input.electionId} to ${input.filename} on the USB drive.`,
        path: input.filename,
      });
      return exportResult;
    },

    async saveTranslationsFile(
      input: ElectionInput & { languageCode: NonEnglishLanguageCode }
    ): Promise<ExportDataResult> {
      loadInProgressElectionInfo(input);
      const result = await exportTranslations(
        store.electionDefinition,
        input.electionId,
        usbDrive,
        input.languageCode
      );
      await logger.logAsCurrentRole(
        LogEventId.TranslationsFileSaved,
        result.isOk()
          ? {
              message: `Saved ${input.languageCode} translations file for election definition ${input.electionId}.`,
              disposition: 'success',
            }
          : {
              message: `Error saving ${input.languageCode} translations file for election definition ${input.electionId}: ${result.err().type}`,
              disposition: 'failure',
            }
      );
      return result;
    },

    async loadTranslationsFile(
      input: ElectionInput & {
        languageCode: NonEnglishLanguageCode;
        filePath: string;
      }
    ): Promise<Result<void, TranslationsImportError>> {
      loadInProgressElectionInfo(input);
      const result = await importTranslations(
        store.electionDefinition,
        input.electionId,
        input.filePath,
        input.languageCode
      );
      await logger.logAsCurrentRole(
        LogEventId.TranslationsFileLoaded,
        result.isOk()
          ? {
              disposition: 'success',
              message: `Loaded ${input.languageCode} translations file for election definition ${input.electionId}.`,
            }
          : {
              disposition: 'failure',
              message: `Error loading ${input.languageCode} translations file for election definition ${input.electionId}: ${result.err().type}`,
            }
      );
      return result;
    },
  } as const;

  return methods satisfies ElectionDefinitionMethods;
}

/**
 * Builds the API for defining an election on VxAdmin, available only to system
 * administrators when election definition is enabled.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildElectionDefinitionApi({
  auth,
  workspace,
  logger,
  usbDrive,
  printer,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
  usbDrive: UsbDrive;
  printer: Printer;
}) {
  return grout.createApi(
    createElectionDefinitionApiMethods({
      workspace,
      logger,
      usbDrive,
      printer,
    }),
    { before: [() => requireElectionDefinitionAccess({ auth, workspace })] }
  );
}

/**
 * A type to be used by the frontend to create an election definition API client
 */
export type ElectionDefinitionApi = ReturnType<
  typeof buildElectionDefinitionApi
>;
