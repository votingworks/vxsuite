import * as grout from '@votingworks/grout';
import { Buffer } from 'buffer';
import {
  BallotStyle as VxBallotStyle,
  Election,
  getBallotStyle,
  getPrecinctById,
  GridLayout,
  Id,
  Precinct as VxPrecinct,
  safeParseElection,
} from '@votingworks/types';
import express, { Application } from 'express';
import { assertDefined, ok, Result } from '@votingworks/basics';
import { layOutBallot } from '@votingworks/design-shared';
import JsZip from 'jszip';
import { ElectionRecord, Precinct, Store } from './store';
import { renderDocumentToPdf } from './render_ballot';

function createBlankElection(): Election {
  return {
    title: '',
    date: '',
    state: '',
    county: {
      id: '',
      name: '',
    },
    sealUrl: '',
    districts: [],
    precincts: [],
    contests: [],
    parties: [],
    ballotStyles: [],
  };
}

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
  precinct: VxPrecinct,
  ballotStyle: VxBallotStyle
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
    listElections(): ElectionRecord[] {
      return store.listElections();
    },

    getElection(input: { electionId: Id }): ElectionRecord {
      return store.getElection(input.electionId);
    },

    createElection(input: { electionData?: string }): Result<Id, Error> {
      let election: Election;
      if (input.electionData) {
        const parseResult = safeParseElection(input.electionData);
        if (parseResult.isErr()) return parseResult;
        election = parseResult.ok();
      } else {
        election = createBlankElection();
      }
      return ok(store.createElection(election));
    },

    updateElection(input: { electionId: Id; election: Election }): void {
      const { election } = store.getElection(input.electionId);
      // TODO validate election
      store.updateElection(input.electionId, {
        ...election,
        ...input.election,
      });
    },

    updatePrecincts(input: { electionId: Id; precincts: Precinct[] }): void {
      store.updatePrecincts(input.electionId, input.precincts);
    },

    deleteElection(input: { electionId: Id }): void {
      store.deleteElection(input.electionId);
    },

    async exportAllBallots(input: { electionId: Id }): Promise<Buffer> {
      const { election } = store.getElection(input.electionId);

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
      electionId: Id;
      precinctId: string;
      ballotStyleId: string;
    }): Promise<Buffer> {
      const { election } = store.getElection(input.electionId);
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

    exportBallotDefinition(input: { electionId: Id }): Election {
      const { election } = store.getElection(input.electionId);

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
