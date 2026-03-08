import { readElectionGeneral } from '@votingworks/fixtures';
import {
  BaseBallotProps,
  BallotStyleId,
  BallotType,
  Election,
  HmpbBallotPaperSize,
  getBallotStyle,
} from '@votingworks/types';
import { assertDefined, iter } from '@votingworks/basics';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import {
  layOutBallotsAndCreateElectionDefinition,
  renderBallotPdfWithMetadataQrCode,
} from './render_ballot';
import { createRustRendererPool } from './rust_renderer';
import { vxDefaultBallotTemplate } from './ballot_templates/vx_default_ballot_template';
import {
  DocumentElement,
  RenderDocument,
  Renderer,
  RendererPool,
  RenderScratchpad,
  Task,
} from './renderer';

vi.setConfig({
  testTimeout: 300_000,
});

function makeElection(): Election {
  const electionGeneral = readElectionGeneral();
  return {
    ...electionGeneral,
    ballotLayout: {
      ...electionGeneral.ballotLayout,
      paperSize: HmpbBallotPaperSize.Letter,
    },
  } as const;
}

function makeBallotProps(
  election: Election,
  ballotStyleId: BallotStyleId
): BaseBallotProps[] {
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  return ballotStyle.precincts.map(
    (precinctId): BaseBallotProps => ({
      election,
      ballotStyleId,
      precinctId,
      ballotType: BallotType.Absentee,
      ballotMode: 'official',
    })
  );
}

interface CallLog {
  method: string;
  duration: number;
  detail?: string;
}

function instrumentDocument(
  doc: RenderDocument,
  log: CallLog[]
): RenderDocument {
  return {
    async setContent(selector: string, element: JSX.Element): Promise<void> {
      const start = performance.now();
      await doc.setContent(selector, element);
      log.push({
        method: 'setContent',
        duration: performance.now() - start,
        detail: selector,
      });
    },
    async getContent(): Promise<string> {
      const start = performance.now();
      const result = await doc.getContent();
      log.push({
        method: 'getContent',
        duration: performance.now() - start,
      });
      return result;
    },
    async countElements(selector: string): Promise<number> {
      const start = performance.now();
      const result = await doc.countElements(selector);
      log.push({
        method: 'countElements',
        duration: performance.now() - start,
        detail: selector,
      });
      return result;
    },
    async inspectElements(selector: string): Promise<DocumentElement[]> {
      const start = performance.now();
      const result = await doc.inspectElements(selector);
      log.push({
        method: 'inspectElements',
        duration: performance.now() - start,
        detail: selector,
      });
      return result;
    },
    async renderToPdf(): Promise<Uint8Array> {
      const start = performance.now();
      const result = await doc.renderToPdf();
      log.push({
        method: 'renderToPdf',
        duration: performance.now() - start,
      });
      return result;
    },
    async close(): Promise<void> {
      await doc.close();
    },
  };
}

function createInstrumentedPool(
  realPool: RendererPool,
  log: CallLog[]
): RendererPool {
  return {
    async runTasks<T>(
      tasks: Array<Task<T>>,
      emitProgress?: (progress: number, total: number) => void
    ): Promise<T[]> {
      const wrappedTasks = tasks.map(
        (task): Task<T> =>
          (renderer) => {
            const instrumentedRenderer: Omit<Renderer, 'close'> = {
              async createScratchpad(
                styles: JSX.Element
              ): Promise<RenderScratchpad> {
                const start = performance.now();
                const scratchpad = await renderer.createScratchpad(styles);
                log.push({
                  method: 'createScratchpad',
                  duration: performance.now() - start,
                });
                // Wrap the scratchpad's document
                const origMeasure = scratchpad.measureElements.bind(scratchpad);
                return {
                  async measureElements(
                    content: JSX.Element,
                    selector: string
                  ) {
                    const mStart = performance.now();
                    const result = await origMeasure(content, selector);
                    log.push({
                      method: 'measureElements',
                      duration: performance.now() - mStart,
                      detail: selector,
                    });
                    return result;
                  },
                  convertToDocument() {
                    const doc = scratchpad.convertToDocument();
                    return instrumentDocument(doc, log);
                  },
                };
              },
              async loadDocumentFromContent(
                htmlContent: string
              ): Promise<RenderDocument> {
                const start = performance.now();
                const doc = await renderer.loadDocumentFromContent(htmlContent);
                log.push({
                  method: 'loadDocumentFromContent',
                  duration: performance.now() - start,
                  detail: `${htmlContent.length} chars`,
                });
                return instrumentDocument(doc, log);
              },
            };
            return task(instrumentedRenderer);
          }
      );
      return realPool.runTasks(wrappedTasks, emitProgress);
    },

    async runTask<T>(task: Task<T>): Promise<T> {
      const [result] = await this.runTasks([task]);
      return result;
    },

    async close(): Promise<void> {
      await realPool.close();
    },
  };
}

describe('Rust renderer pipeline profiling', () => {
  const BALLOT_STYLE_ID = '12' as BallotStyleId;

  test('detailed pipeline phase profiling', async () => {
    const election = makeElection();
    const allBallotProps = makeBallotProps(election, BALLOT_STYLE_ID);

    const rustPool = await createRustRendererPool();

    // Warmup run
    {
      const { electionDefinition, ballotContents } =
        await layOutBallotsAndCreateElectionDefinition(
          rustPool,
          vxDefaultBallotTemplate,
          allBallotProps,
          'vxf'
        );
      const { precinctId } = allBallotProps[0];
      const [blankBallotContents, ballotProps] = assertDefined(
        iter(ballotContents)
          .zip(allBallotProps)
          .find(([, props]) => props.precinctId === precinctId)
      );
      await rustPool.runTask(async (renderer) => {
        const ballotDocument =
          await renderer.loadDocumentFromContent(blankBallotContents);
        await renderBallotPdfWithMetadataQrCode(
          ballotProps,
          ballotDocument,
          electionDefinition
        );
      });
    }

    // Profiled run with instrumentation
    const log: CallLog[] = [];
    const instrumentedPool = createInstrumentedPool(rustPool, log);

    const totalStart = performance.now();

    // Phase 1: Layout
    const layoutStart = performance.now();
    const { electionDefinition, ballotContents } =
      await layOutBallotsAndCreateElectionDefinition(
        instrumentedPool,
        vxDefaultBallotTemplate,
        allBallotProps,
        'vxf'
      );
    const layoutTime = performance.now() - layoutStart;

    // Phase 2: PDF render
    const { precinctId } = allBallotProps[0];
    const [blankBallotContents, ballotProps] = assertDefined(
      iter(ballotContents)
        .zip(allBallotProps)
        .find(([, props]) => props.precinctId === precinctId)
    );

    // Clear log to separate layout from PDF rendering calls
    const layoutLog = [...log];
    log.length = 0;

    const pdfStart = performance.now();
    await instrumentedPool.runTask(async (renderer) => {
      const ballotDocument =
        await renderer.loadDocumentFromContent(blankBallotContents);
      await renderBallotPdfWithMetadataQrCode(
        ballotProps,
        ballotDocument,
        electionDefinition
      );
    });
    const pdfTime = performance.now() - pdfStart;
    const pdfLog = [...log];

    const totalTime = performance.now() - totalStart;

    await rustPool.close();

    // Analyze and report
    const lines: string[] = [];
    function emit(line: string) { return lines.push(line) };

    emit('=== Rust PDF Renderer Pipeline Analysis ===');
    emit(`Date: ${new Date().toISOString()}`);
    emit(`Ballot: Style ${BALLOT_STYLE_ID}, Election General`);
    emit('');
    emit(`Total pipeline:     ${totalTime.toFixed(0)}ms`);
    emit(
      `  Phase 1 (Layout): ${layoutTime.toFixed(0)}ms (${(
        (layoutTime / totalTime) *
        100
      ).toFixed(0)}%)`
    );
    emit(
      `  Phase 2 (PDF):    ${pdfTime.toFixed(0)}ms (${(
        (pdfTime / totalTime) *
        100
      ).toFixed(0)}%)`
    );
    emit('');

    // Summarize layout phase calls
    emit('--- Phase 1: Layout Phase Breakdown ---');
    const layoutByMethod = new Map<
      string,
      { count: number; totalMs: number }
    >();
    for (const entry of layoutLog) {
      const existing = layoutByMethod.get(entry.method) ?? {
        count: 0,
        totalMs: 0,
      };
      existing.count += 1;
      existing.totalMs += entry.duration;
      layoutByMethod.set(entry.method, existing);
    }
    const layoutRustTime = [...layoutByMethod.entries()].reduce(
      (sum, [, v]) => sum + v.totalMs,
      0
    );
    const layoutJsTime = layoutTime - layoutRustTime;

    emit(`  Total Rust/NAPI calls: ${layoutRustTime.toFixed(0)}ms`);
    emit(
      `  Remaining JS time:     ${layoutJsTime.toFixed(
        0
      )}ms (React render, election def creation, etc.)`
    );
    emit('');
    for (const [method, stats] of [...layoutByMethod.entries()].sort(
      (a, b) => b[1].totalMs - a[1].totalMs
    )) {
      emit(
        `  ${method}: ${stats.count} calls, ${stats.totalMs.toFixed(
          0
        )}ms total, ${(stats.totalMs / stats.count).toFixed(1)}ms avg`
      );
    }
    emit('');

    // Detail of each layout call
    emit('--- Phase 1: Individual Calls ---');
    for (const entry of layoutLog) {
      emit(
        `  ${entry.method}(${entry.detail ?? ''}): ${entry.duration.toFixed(
          1
        )}ms`
      );
    }
    emit('');

    // Summarize PDF phase calls
    emit('--- Phase 2: PDF Phase Breakdown ---');
    const pdfByMethod = new Map<string, { count: number; totalMs: number }>();
    for (const entry of pdfLog) {
      const existing = pdfByMethod.get(entry.method) ?? {
        count: 0,
        totalMs: 0,
      };
      existing.count += 1;
      existing.totalMs += entry.duration;
      pdfByMethod.set(entry.method, existing);
    }

    for (const [method, stats] of [...pdfByMethod.entries()].sort(
      (a, b) => b[1].totalMs - a[1].totalMs
    )) {
      emit(
        `  ${method}: ${stats.count} calls, ${stats.totalMs.toFixed(
          0
        )}ms total, ${(stats.totalMs / stats.count).toFixed(1)}ms avg`
      );
    }
    emit('');

    // Detail of each PDF call
    emit('--- Phase 2: Individual Calls ---');
    for (const entry of pdfLog) {
      emit(
        `  ${entry.method}(${entry.detail ?? ''}): ${entry.duration.toFixed(
          1
        )}ms`
      );
    }
    emit('');

    // Bottleneck analysis
    emit('--- Bottleneck Analysis ---');
    const allCalls = [...layoutLog, ...pdfLog];
    const top10 = [...allCalls]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);
    emit('Top 10 slowest calls:');
    for (const entry of top10) {
      emit(
        `  ${entry.duration.toFixed(1)}ms - ${entry.method}(${
          entry.detail ?? ''
        })`
      );
    }

    const output = lines.join('\n');
    // eslint-disable-next-line no-console
    console.log(`\n${output}`);

    // Save to file
    const outputDir = join(__dirname, '../fixtures/rust-renderer');
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, 'pipeline-analysis.txt'), output);

    expect(totalTime).toBeGreaterThan(0);
  });
});
