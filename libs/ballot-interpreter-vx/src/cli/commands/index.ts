import { Command } from '../types';
import * as helpCommand from './help';
import * as interpretCommand from './interpret';
import * as layoutCommand from './layout';

export function get(): Command[] {
  return [
    {
      name: helpCommand.name,
      description: helpCommand.description,
      printHelp: helpCommand.printHelp,
      run: helpCommand.run,
    },
    {
      name: interpretCommand.name,
      description: interpretCommand.description,
      printHelp: interpretCommand.printHelp,
      run: interpretCommand.run,
    },
    {
      name: layoutCommand.name,
      description: layoutCommand.description,
      printHelp: layoutCommand.printHelp,
      run: layoutCommand.run,
    },
  ];
}
