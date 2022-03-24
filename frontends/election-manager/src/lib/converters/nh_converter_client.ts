import {
  convertElectionDefinition,
  templates,
} from '@votingworks/ballot-interpreter-nh';
import { ConverterClient, VxFile, VxFiles } from './types';
import { pdfToImages } from '../../utils/pdf_to_images';
import { readBlobAsArrayBuffer, readBlobAsString } from '../blob';

const NhCardDefinitionFile: VxFile = {
  name: 'NH Card Definition (XML)',
  accept: 'application/xml',
};
const NhCardBallotFile: VxFile = {
  name: 'NH Card Ballot (PDF)',
  accept: 'application/pdf',
};
const VxElectionDefinitionFile: VxFile = {
  name: 'VX Election Definition',
};

export class NhConverterClient implements ConverterClient {
  private inputFiles: Map<VxFile, File | undefined> = new Map([
    [NhCardDefinitionFile, undefined],
    [NhCardBallotFile, undefined],
  ]);
  private outputFiles: Map<VxFile, Blob | undefined> = new Map([
    [VxElectionDefinitionFile, undefined],
  ]);

  getDisplayName(): string {
    return 'NH';
  }

  async setInputFile(name: string, content: File): Promise<void> {
    for (const key of this.inputFiles.keys()) {
      if (key.name === name) {
        this.inputFiles.set(key, content);
        return;
      }
    }

    throw new Error(`input file "${name}" not found`);
  }

  async process(): Promise<void> {
    const nhCardDefinitionFile = this.inputFiles.get(NhCardDefinitionFile);
    const nhCardBallotFile = this.inputFiles.get(NhCardBallotFile);

    if (!nhCardDefinitionFile) {
      throw new Error(`input file "${NhCardDefinitionFile.name}" not found`);
    }

    if (!nhCardBallotFile) {
      throw new Error(`input file "${NhCardBallotFile.name}" not found`);
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
      'application/xml'
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
      VxElectionDefinitionFile,
      new Blob([JSON.stringify(election, null, 2)])
    );
  }

  async getOutputFile(name: string): Promise<Blob> {
    const [, outputBlob] =
      [...this.outputFiles].find(
        ([{ name: outputName }]) => outputName === name
      ) ?? [];

    if (!outputBlob) {
      throw new Error(`output file "${name}" not found`);
    }

    return outputBlob;
  }

  async getFiles(): Promise<VxFiles> {
    return {
      inputFiles: [...this.inputFiles.entries()].map(
        ([{ name, accept }, file]) => ({
          name,
          accept,
          path: file ? name : undefined,
        })
      ),
      outputFiles: [...this.outputFiles.entries()].map(([{ name }, blob]) => ({
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
