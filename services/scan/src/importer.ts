import { ElectionDefinition, err, ok, Result } from '@votingworks/types';
import { assert, deferred, Deferred } from '@votingworks/utils';
import { BatchControl, Scanner } from './scanners';
import { Store } from './store';
import { PageInterpretationWithFiles, SheetOf } from './types';

export interface Interpreter {
  readonly name: string;
  interpret(
    electionDefinition: ElectionDefinition,
    sheet: SheetOf<string>
  ): Promise<Result<SheetOf<PageInterpretationWithFiles>, Error>>;
}

export interface ImporterOptions {
  readonly store: Store;
  readonly scanner: Scanner;
  readonly interpreters: Interpreter[];
}

export class Importer {
  private readonly store: Store;
  private readonly scanner: Scanner;
  private readonly interpreters: Interpreter[];
  private currentBatch?: BatchControl;
  private currentBatchDeferred?: Deferred<void>;

  constructor(options: ImporterOptions) {
    this.store = options.store;
    this.scanner = options.scanner;
    this.interpreters = options.interpreters;
  }

  /**
   * Starts scanning sheets, continuing until there are no sheets left to scan.
   * Resolves immediately, and so does not wait for scanning to complete.
   *
   * @returns A {@link Result} with a batch ID or an {@link Error} if scanning
   *          is already in progress.
   */
  async startScanBatch(): Promise<Result<string, Error>> {
    if (this.currentBatch) {
      return err(new Error('Scan batch already in progress'));
    }

    const paperSize = await this.store.getBallotPaperSizeForElection();
    const batchId = await this.store.addBatch();
    this.currentBatch = this.scanner.scanSheets({ paperSize });
    this.currentBatchDeferred = deferred();
    void this.continueScanBatch();
    return ok(batchId);
  }

  /**
   * Continues scanning sheets until there are no sheets left to scan if there
   * is a batch in progress.
   */
  private async continueScanBatch(): Promise<void> {
    if (!this.currentBatch) {
      return;
    }

    const sheet = await this.currentBatch.scanSheet();
    if (!sheet) {
      await this.finishScanBatch();
      return;
    }

    const addScannedSheetResult = await this.store.addScannedSheet(sheet);
    if (addScannedSheetResult.isErr()) {
      await this.finishScanBatch({
        error: addScannedSheetResult.err().message,
      });
      return;
    }

    const currentElection = await this.store.getCurrentElection();
    if (!currentElection) {
      await this.finishScanBatch({
        error: 'no election in progress',
      });
      return;
    }

    const sheetId = addScannedSheetResult.ok();

    // TODO: short-circuit this if one is successful
    const interpretationIds = await Promise.all(
      this.interpreters.map(async (interpreter) => {
        const result = await interpreter.interpret(
          currentElection.definition,
          sheet
        );
        if (result.isOk()) {
          const addScanInterpretation = await this.store.addScanInterpretation(
            sheetId,
            interpreter.name,
            result.ok()
          );

          if (addScanInterpretation.isErr()) {
            // TODO: log this error
            return;
          }

          return addScanInterpretation.ok();
        }
      })
    );

    const firstSuccessfulInterpretationId = interpretationIds.find(
      (id) => id !== undefined
    );
    if (firstSuccessfulInterpretationId) {
      await this.store.selectScanInterpretation(
        sheetId,
        firstSuccessfulInterpretationId
      );
    }

    void this.continueScanBatch();
  }

  /**
   * Returns a promise that resolves when scanning is complete.
   */
  async waitForCurrentBatch(): Promise<void> {
    return this.currentBatchDeferred?.promise;
  }

  /**
   * Stops the current batch if there is one running.
   */
  private async finishScanBatch({
    error,
  }: { error?: string } = {}): Promise<void> {
    assert(
      !this.currentBatch === !this.currentBatchDeferred,
      'invalid state: currentBatch and currentBatchDeferred are both set or both unset'
    );

    if (!this.currentBatch || !this.currentBatchDeferred) {
      return;
    }

    await this.currentBatch.endBatch();
    this.currentBatch = undefined;
    await this.store.finishCurrentBatch({ error });
    this.currentBatchDeferred.resolve();
    this.currentBatchDeferred = undefined;
  }
}
