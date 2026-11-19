import { resolve } from 'node:path';
import { summarizeResults } from './summary.ts';

const root = resolve(process.argv[2] ?? `${import.meta.dirname}/results`);
console.log(summarizeResults(root));
console.log(
  `\nWrote ${root}/headline.md (this table), summary.md (more columns) and summary.csv (every field)`
);
