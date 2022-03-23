import {
  convertElectionDefinition,
  templates,
} from '@votingworks/ballot-interpreter-nh';
import { ConverterClient, VxFiles } from './types';
import { pdfToImages } from '../../utils/pdf_to_images';
import { readBlobAsArrayBuffer, readBlobAsString } from '../blob';

const NhCardDefinitionFileName = 'NH Card Definition (XML)';
const NhCardBallotFileName = 'NH Card Ballot (PDF)';
const VxElectionDefinitionFileName = 'VX Election Definition';

export class NhConverterClient implements ConverterClient {
  private inputFiles: Map<string, File | undefined> = new Map([
    [NhCardDefinitionFileName, undefined],
    [NhCardBallotFileName, undefined],
  ]);
  private outputFiles: Map<string, Blob | undefined> = new Map([
    [VxElectionDefinitionFileName, undefined],
  ]);

  getDisplayName(): string {
    return 'NH';
  }

  async setInputFile(name: string, content: File): Promise<void> {
    for (const key of this.inputFiles.keys()) {
      if (key === name) {
        this.inputFiles.set(key, content);
        return;
      }
    }

    throw new Error(`input file "${name}" not found`);
  }

  async process(): Promise<void> {
    const nhCardDefinitionFile = this.inputFiles.get(NhCardDefinitionFileName);
    const nhCardBallotFile = this.inputFiles.get(NhCardBallotFileName);

    if (!nhCardDefinitionFile) {
      throw new Error(`input file "${NhCardDefinitionFileName}" not found`);
    }

    if (!nhCardBallotFile) {
      throw new Error(`input file "${NhCardBallotFileName}" not found`);
    }

    const nhCardBallotImages: ImageData[] = [];

    for await (const { page, pageCount } of pdfToImages(
      Buffer.from(await readBlobAsArrayBuffer(nhCardBallotFile)),
      { scale: 1 }
    )) {
      if (pageCount > 2) {
        throw new Error(
          `Expected exactly 2 pages in NH card ballot, but got ${pageCount}`
        );
      }

      nhCardBallotImages.push(page);
    }

    const parser = new DOMParser();
    const definition = parser.parseFromString(
      await readBlobAsString(nhCardDefinitionFile),
      'text/xml'
    ).documentElement;

    const [front, back] = nhCardBallotImages;

    const convertResult = convertElectionDefinition(
      {
        definition,
        front,
        back,
      },
      { ovalTemplate: await templates.getOvalTemplate() }
    );

    if (convertResult.isErr()) {
      throw convertResult.err();
    }

    const election = convertResult.ok();

    this.outputFiles.set(
      VxElectionDefinitionFileName,
      new Blob([JSON.stringify(election, null, 2)])
    );
  }

  async getOutputFile(name: string): Promise<Blob> {
    const outputBlob = this.outputFiles.get(name);

    if (!outputBlob) {
      throw new Error(`output file "${name}" not found`);
    }

    return outputBlob;
  }

  async getFiles(): Promise<VxFiles> {
    return {
      inputFiles: [...this.inputFiles.entries()].map(([name, file]) => ({
        name,
        path: file ? name : undefined,
      })),
      outputFiles: [...this.outputFiles.entries()].map(([name, blob]) => ({
        name,
        path: blob ? name : undefined,
      })),
    };
  }

  async reset(): Promise<void> {
    for (const name of this.inputFiles.keys()) {
      this.inputFiles.set(name, undefined);
    }
    for (const name of this.outputFiles.keys()) {
      this.outputFiles.set(name, undefined);
    }
  }
}
