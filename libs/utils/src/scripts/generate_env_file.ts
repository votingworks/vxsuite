import * as readline from 'readline';
import * as fs from 'fs';
import { join } from 'path';
import yargs from 'yargs';
import { ZodSchema } from 'zod';
import { safeParse } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getBooleanEnvVarConfig,
  getStringEnvVarConfig,
  StringEnvironmentVariableName,
} from '../environment_variable';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

interface GenerateEnvFileArguments {
  outputPath?: string;
  isVxDev?: boolean;
  help?: boolean;
}

const flagOptions: Map<string, boolean> = new Map();
function boolQuestion(flagName: string, enable: boolean) {
  return new Promise<void>((resolve) => {
    rl.question(
      `Enable ${flagName}? (${enable ? 'Y/n' : 'y/N'}):`,
      (answer) => {
        if (answer === 'n' || answer === 'N') {
          flagOptions.set(flagName, false);
        } else if (answer === 'y' || answer === 'Y') {
          flagOptions.set(flagName, true);
        } else {
          flagOptions.set(flagName, enable);
        }
        resolve();
      }
    );
  });
}

const stringVariableOptions: Map<string, string> = new Map();
function stringQuestion(
  varName: string,
  defaultVal: string,
  schema?: ZodSchema
) {
  return new Promise<void>((resolve) => {
    rl.question(`Value for ${varName}? (Default: ${defaultVal}):`, (answer) => {
      if (answer === '') {
        stringVariableOptions.set(varName, defaultVal);
      } else if (!schema) {
        stringVariableOptions.set(varName, answer);
      } else {
        const parsed = safeParse(schema, answer);
        if (parsed.isOk()) {
          stringVariableOptions.set(varName, parsed.ok());
        }
        if (parsed.isErr()) {
          // eslint-disable-next-line no-console
          console.log('Invalid input, Please try again.');
          process.exit(1);
        }
      }
      resolve();
    });
  });
}

function getEnvFileContents(isVxDev: boolean): string {
  let output = '';
  for (const flagName of flagOptions.keys()) {
    output += `${flagName}=${flagOptions.get(flagName) ? 'TRUE' : 'FALSE'}\n`;
  }
  for (const varName of stringVariableOptions.keys()) {
    output += `${varName}=${stringVariableOptions.get(varName)}\n`;
  }
  if (isVxDev) {
    output += 'REACT_APP_VX_DEV=true';
  }
  return output;
}

async function generateEnvFile(filePath: string, isVexDev: boolean) {
  const flagDetails = Object.values(BooleanEnvironmentVariableName).map(
    (flag) => getBooleanEnvVarConfig(flag)
  );
  for (const flag of flagDetails) {
    await boolQuestion(
      flag.name,
      flag.autoEnableInVxDev ?? flag.autoEnableInDevelopment
    );
  }
  const stringDetails = Object.values(StringEnvironmentVariableName).map(
    (variable) => getStringEnvVarConfig(variable)
  );
  for (const stringVar of stringDetails) {
    await stringQuestion(
      stringVar.name,
      stringVar.defaultValue,
      stringVar.zodSchema
    );
  }
  fs.writeFileSync(filePath, getEnvFileContents(isVexDev));
  rl.close();
}

const optionParser = yargs()
  .strict()
  .exitProcess(false)
  .options({
    outputPath: {
      type: 'string',
      alias: 'o',
      description:
        'Path to write the generated environment file to, i.e. /vx/config/.env',
    },
    isVxDev: {
      type: 'boolean',
      default: false,
      description:
        'Identifies when the generated file is for VxDev and should include the VxDev flag.',
    },
  })
  .alias('-h', '--help')
  .help(false)
  .version(false)
  .fail((_msg: unknown, err: unknown) => {
    if (err) {
      process.stderr.write(`${err}\n`);
    }
    process.exit(1);
  });

const args: GenerateEnvFileArguments = optionParser.parse(
  process.argv.slice(2)
) as GenerateEnvFileArguments;

if (args.help) {
  optionParser.showHelp((out) => {
    process.stdout.write(out);
    process.stdout.write('\n');
  });
  process.exit(0);
}

const fileLocation = join(__dirname, '../../../..');
const fileName = '.env.local';
const filePath = args.outputPath ?? join(fileLocation, fileName);
void generateEnvFile(filePath, args.isVxDev ?? false);
