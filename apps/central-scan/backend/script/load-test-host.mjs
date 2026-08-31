// Local VxAdmin peer-API host for exercising cvr-send-load-test.mjs without
// real hardware. Creates a throwaway workspace, configures the
// two-party-primary election, and serves ONLY the peer API on --port.
// For local verification only — point the load test at a real VxAdmin for
// actual measurements.

import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';

const ADMIN_BUILD = path.join(
  import.meta.dirname,
  '../../../admin/backend/build'
);
const { createWorkspace } = await import(
  path.join(ADMIN_BUILD, 'util/workspace.js')
);
const { buildPeerApp } = await import(path.join(ADMIN_BUILD, 'peer_app.js'));
const { BaseLogger, LogSource } = await import('@votingworks/logging');
const { DEFAULT_SYSTEM_SETTINGS } = await import('@votingworks/types');

const port = Number(process.argv[2] ?? 3102);
const workspacePath =
  process.env.LOAD_TEST_WORKSPACE ??
  fs.mkdtempSync(path.join(os.tmpdir(), 'vx-load-test-host-'));

const logger = new BaseLogger(LogSource.VxAdminService);
const workspace = createWorkspace(workspacePath, logger);

const electionDefinition =
  electionTwoPartyPrimaryFixtures.readElectionDefinition();
const packagePath = path.join(workspacePath, 'election-package.zip');
fs.writeFileSync(packagePath, electionDefinition.electionData);
const electionId = await workspace.store.addElection({
  electionData: electionDefinition.electionData,
  systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
  electionPackageSourceFilePath: packagePath,
  electionPackageHash: 'load-test',
});
workspace.store.setCurrentElectionId(electionId);

const app = buildPeerApp({ workspace, logger, machineId: 'LOAD-HOST' });
app.listen(port, () => {
  console.log(
    `load-test host: peer API on http://localhost:${port} (workspace ${workspacePath})`
  );
});
