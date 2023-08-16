import * as grout from '@votingworks/grout';
import { Buffer } from 'buffer';
import {
  Election,
  getPrecinctById,
  Id,
  safeParseElection,
  BallotPaperSize,
  DEFAULT_SYSTEM_SETTINGS,
} from '@votingworks/types';
import express, { Application } from 'express';
import { assertDefined, find, ok, Result } from '@votingworks/basics';
import { layOutAllBallots } from '@votingworks/hmpb-layout';
import JsZip from 'jszip';
import { renderDocumentToPdf } from '@votingworks/hmpb-render-backend';
import { ElectionRecord, Precinct, Store } from './store';

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
    ballotLayout: {
      paperSize: BallotPaperSize.Letter,
      metadataEncoding: 'qr-code',
    },
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

    async exportAllBallots(input: {
      electionId: Id;
    }): Promise<{ zipContents: Buffer; electionHash: string }> {
      const { election } = store.getElection(input.electionId);
      const { ballots, electionDefinition } = layOutAllBallots({
        election,
        isTestMode: true,
      }).unsafeUnwrap();

      const zip = new JsZip();

      for (const { document, gridLayout } of ballots) {
        const { precinctId, ballotStyleId } = gridLayout;
        const precinct = assertDefined(
          getPrecinctById({ election, precinctId })
        );
        const pdf = renderDocumentToPdf(document);
        const fileName = `ballot-${precinct.name.replaceAll(
          ' ',
          '_'
        )}-${ballotStyleId}.pdf`;
        zip.file(fileName, pdf);
        pdf.end();
      }

      return {
        zipContents: await zip.generateAsync({ type: 'nodebuffer' }),
        electionHash: electionDefinition.electionHash,
      };
    },

    async exportBallot(input: {
      electionId: Id;
      precinctId: string;
      ballotStyleId: string;
    }): Promise<Buffer> {
      const { election } = store.getElection(input.electionId);
      const { ballots } = layOutAllBallots({
        election,
        isTestMode: true,
      }).unsafeUnwrap();
      const { document } = find(
        ballots,
        ({ gridLayout }) =>
          gridLayout.precinctId === input.precinctId &&
          gridLayout.ballotStyleId === input.ballotStyleId
      );
      const pdf = renderDocumentToPdf(document);
      pdf.end();
      return streamToBuffer(pdf);
    },

    async exportSetupPackage(input: {
      electionId: Id;
    }): Promise<{ zipContents: Buffer; electionHash: string }> {
      const { election } = store.getElection(input.electionId);
      const { electionDefinition } = layOutAllBallots({
        election,
        isTestMode: true,
      }).unsafeUnwrap();

      const zip = new JsZip();
      zip.file('election.json', electionDefinition.electionData);
      zip.file(
        'systemSettings.json',
        JSON.stringify(DEFAULT_SYSTEM_SETTINGS, null, 2)
      );

      return {
        zipContents: await zip.generateAsync({ type: 'nodebuffer' }),
        electionHash: electionDefinition.electionHash,
      };
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
