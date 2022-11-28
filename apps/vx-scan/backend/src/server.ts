import express, { Application, RequestHandler, response } from 'express';
import grout from '@votingworks/grout';

export interface Config {
  electionName: string;
  precinctName: string;
}

let store: { config: Config | undefined } = {
  config: {
    electionName: 'Election Name',
    precinctName: 'Precinct Name',
  },
};

export type ScannerStatus = 'no_paper' | 'scanning' | 'accepted';

const scannerStateMachine = {
  state: 'no_paper' as ScannerStatus,
  transition() {
    switch (this.state) {
      case 'no_paper':
        this.state = 'scanning';
        break;
      case 'scanning':
        this.state = 'accepted';
        break;
      case 'accepted':
        this.state = 'no_paper';
        break;
    }
  },
};

const api = grout.createApi({
  getConfig: grout.query(async (): Promise<Config | undefined> => {
    return store.config;
  }),

  updateConfig: grout.mutation(async (newConfig: Config): Promise<void> => {
    store.config = newConfig;
  }),

  getScannerStatus: grout.query(
    async (): Promise<{ status: ScannerStatus }> => {
      if (Math.random() < 1 / 3) {
        scannerStateMachine.transition();
      }
      return { status: scannerStateMachine.state };
    }
  ),
});

export type VxScanApi = typeof api;

export async function start() {
  const app: Application = express();
  app.use(express.json());
  grout.express.registerRoutes(api, app);
  app.listen(3001);
}
