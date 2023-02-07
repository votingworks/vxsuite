import { main } from './index';

process.exitCode = await main(process.argv.slice(2));
