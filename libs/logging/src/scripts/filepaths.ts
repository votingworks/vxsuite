import { join } from 'node:path';

const packageRoot = join(import.meta.dirname, '../..');
const scriptsDir = join(packageRoot, 'src/scripts');

export const configFilepath = join(packageRoot, 'log_event_details.toml');

export const logEventIdsTemplateFilepath = join(
  scriptsDir,
  'log_event_enums.ts.template'
);
export const logEventIdsOutputFilepath = join(
  packageRoot,
  'src/log_event_enums.ts'
);

export const rustEnumsTemplateFilepath = join(
  scriptsDir,
  'log_event_enums.rs.template'
);
export const rustEnumsOutputFilepath = join(
  packageRoot,
  'types-rust/src/log_event_enums.rs'
);

export const markdownDocumentationFilepath = join(
  packageRoot,
  'VotingWorksLoggingDocumentation.md'
);

export const checkTypescriptOutputTempFilepath = join(
  scriptsDir,
  'temp_check_generate_output.ts'
);
export const checkRustOutputTempFilepath = join(
  scriptsDir,
  'temp_check_generate_output.rs'
);
