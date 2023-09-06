import { main } from './index';

main(process.argv.slice(2)).then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exit(1);
  }
);
