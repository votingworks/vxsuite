import { PromiseOr } from '@votingworks/types';

export interface Command {
  name: string;
  description: string;
  printHelp(globalOptions: GlobalOptions, out: NodeJS.WritableStream): void;
  run(
    commands: readonly Command[],
    globalOptions: GlobalOptions,
    stdin: NodeJS.ReadableStream,
    stdout: NodeJS.WritableStream,
    stderr: NodeJS.WritableStream
  ): PromiseOr<number>;
}

export interface GlobalOptions {
  nodePath: string;
  executablePath: string;
  help: boolean;
  command: string;
  commandArgs: readonly string[];
}
