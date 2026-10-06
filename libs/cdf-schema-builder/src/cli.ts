import { readFileSync } from 'node:fs';
import { buildSchema } from './index.js';

function usage(out: NodeJS.WritableStream) {
  out.write(`Usage: cdf-schema-builder <schema.xml> <schema.json>\n`);
}

/**
 * Entry point for `cdf-schema-builder`.
 */
export function main(
  argv: readonly string[],
  {
    stdout,
    stderr,
  }: { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream }
): number {
  let xsdSchemaFilePath: string | undefined;
  let jsonSchemaFilePath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    switch (arg) {
      case '-h':
      case '--help': {
        usage(stdout);
        return 0;
      }

      default: {
        if (arg.startsWith('-')) {
          stderr.write(`error: unknown option: ${arg}\n`);
          usage(stderr);
        } else if (arg.endsWith('.xsd') || arg.endsWith('.xml')) {
          xsdSchemaFilePath = arg;
        } else if (arg.endsWith('.json')) {
          jsonSchemaFilePath = arg;
        } else {
          stderr.write(`error: unknown file extension: ${arg}\n`);
          usage(stderr);
        }
      }
    }
  }

  if (!xsdSchemaFilePath || !jsonSchemaFilePath) {
    stderr.write('error: missing XSD or JSON schema file path\n');
    usage(stderr);
    return 1;
  }

  const xsdSchemaFileContents = readFileSync(xsdSchemaFilePath, 'utf-8');
  const jsonSchemaFileContents = readFileSync(jsonSchemaFilePath, 'utf-8');

  buildSchema(
    xsdSchemaFileContents,
    jsonSchemaFileContents,
    stdout
  ).unsafeUnwrap();

  return 0;
}
