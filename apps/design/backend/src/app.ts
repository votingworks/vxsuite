import * as grout from '@votingworks/grout';
import { Buffer } from 'buffer';
import {
  BallotStyle,
  Election,
  ElectionDefinition,
  getBallotStyle,
  getPrecinctById,
  GridLayout,
  Precinct,
  safeParseElection,
} from '@votingworks/types';
import express, { Application } from 'express';
import { assert, assertDefined, ok, Result } from '@votingworks/basics';
import { layOutBallot } from '@votingworks/design-shared';
import JsZip from 'jszip';
import { Store } from './store';
import { renderDocumentToPdf } from './render_ballot';

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function exportBallotToPdf(
  election: Election,
  precinct: Precinct,
  ballotStyle: BallotStyle
) {
  const ballotResult = layOutBallot(election, precinct, ballotStyle);
  if (ballotResult.isErr()) {
    throw new Error(
      `Error generating ballot for precinct ${precinct.name}, ballot style ${
        ballotStyle.id
      }: ${ballotResult.err().message}`
    );
  }
  return renderDocumentToPdf(ballotResult.ok().document);
}

function buildApi({ store }: { store: Store }) {
  return grout.createApi({
    getElection(): ElectionDefinition | null {
      return store.getElection() ?? null;
    },

    setElection(input: { electionData?: string }): Result<void, Error> {
      if (input.electionData) {
        const parseResult = safeParseElection(input.electionData);
        if (parseResult.isErr()) return parseResult;
      }
      store.setElection(input.electionData);
      return ok();
    },

    async exportAllBallots(): Promise<Buffer> {
      const electionDefinition = store.getElection();
      assert(electionDefinition !== undefined);
      const { election } = electionDefinition;

      const zip = new JsZip();

      for (const ballotStyle of election.ballotStyles) {
        for (const precinctId of ballotStyle.precincts) {
          const precinct = assertDefined(
            getPrecinctById({ election, precinctId })
          );
          const pdf = exportBallotToPdf(election, precinct, ballotStyle);
          const fileName = `ballot-${precinct.name.replace(' ', '_')}-${
            ballotStyle.id
          }.pdf`;
          zip.file(fileName, pdf);
          pdf.end();
        }
      }

      return zip.generateAsync({ type: 'nodebuffer' });
    },

    async exportBallot(input: {
      precinctId: string;
      ballotStyleId: string;
    }): Promise<Buffer> {
      const electionDefinition = store.getElection();
      assert(electionDefinition !== undefined);
      const { election } = electionDefinition;
      const precinct = getPrecinctById({
        election,
        precinctId: input.precinctId,
      });
      const ballotStyle = getBallotStyle({
        election,
        ballotStyleId: input.ballotStyleId,
      });
      const pdf = exportBallotToPdf(
        election,
        assertDefined(precinct),
        assertDefined(ballotStyle)
      );
      pdf.end();
      return streamToBuffer(pdf);
    },

    exportBallotDefinition(): Election {
      const electionDefinition = store.getElection();
      assert(electionDefinition !== undefined);
      const { election } = electionDefinition;

      const gridLayouts: GridLayout[] = [];
      for (const ballotStyle of election.ballotStyles) {
        for (const precinctId of ballotStyle.precincts) {
          const precinct = assertDefined(
            getPrecinctById({ election, precinctId })
          );
          const ballotResult = layOutBallot(election, precinct, ballotStyle);
          if (ballotResult.isErr()) {
            throw new Error(
              `Error generating ballot for precinct ${
                precinct.name
              }, ballot style ${ballotStyle.id}: ${ballotResult.err().message}`
            );
          }
          gridLayouts.push(ballotResult.ok().gridLayout);
        }
      }

      return { ...election, gridLayouts };
    },
  });
}
export type Api = ReturnType<typeof buildApi>;

export function buildApp({ store }: { store: Store }): Application {
  const app: Application = express();
  const api = buildApi({ store });
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
