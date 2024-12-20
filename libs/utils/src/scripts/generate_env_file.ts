import * as readline from 'node:readline';
import * as fs from 'node:fs';
import { join } from 'node:path';
import yargs from 'yargs';
import {
  BooleanEnvironmentVariableName,
  getBooleanEnvVarConfig,
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

function getEnvFileContents(isVxDev: boolean): string {
  let output = '';
  for (const flagName of flagOptions.keys()) {
    output += `${flagName}=${flagOptions.get(flagName) ? 'TRUE' : 'FALSE'}\n`;
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
