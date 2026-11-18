import { resolve } from 'node:path';
import { summarizeResults } from './summary.ts';

const root = resolve(process.argv[2] ?? `${import.meta.dirname}/results`);
const summaries = summarizeResults(root);
console.log(
  `Summarized ${summaries.length} runs into ${root}/summary.md and summary.csv`
);
