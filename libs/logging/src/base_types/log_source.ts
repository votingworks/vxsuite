export enum LogSource {
  System = 'system',
  VxAdminFrontend = 'vx-admin-frontend',
  VxAdminFrontendServer = 'vx-admin-frontend-server',
  VxAdminService = 'vx-admin-service',
  VxCentralScanFrontend = 'vx-central-scan-frontend',
  VxCentralScanFrontendServer = 'vx-central-scan-frontend-server',
  VxCentralScanService = 'vx-central-scan-service',
  VxDesignService = 'vx-design-service',
  VxDesignWorker = 'vx-design-worker',
  VxScanFrontend = 'vx-scan-frontend',
  VxScanFrontendServer = 'vx-scan-frontend-server',
  VxScanBackend = 'vx-scan-backend',
  VxMarkFrontend = 'vx-mark-frontend',
  VxMarkFrontendServer = 'vx-mark-frontend-server',
  VxMarkBackend = 'vx-mark-backend',
  VxMarkScanFrontend = 'vx-mark-scan-frontend',
  VxMarkScanFrontendServer = 'vx-mark-scan-frontend-server',
  VxMarkScanBackend = 'vx-mark-scan-backend',
  VxMarkScanPatDaemon = 'vx-mark-scan-pat-daemon',
  VxMarkScanControllerDaemon = 'vx-mark-scan-controller-daemon',
  VxBallotActivationFrontend = 'vx-ballot-activation-frontend',
  VxBallotActivationService = 'vx-ballot-activation-service',
  VxScanService = 'vx-scan-service',
  VxDevelopmentScript = 'vx-development-script',
}

export enum AppName {
  VxMark = 'vx-mark',
  VxScan = 'vx-scan',
  VxMarkScan = 'vx-mark-scan',
  VxAdmin = 'vx-admin',
  VxCentralScan = 'vx-central-scan',
}

// The following log sources are frontends and always expect to log through window.kiosk
// In various tests window.kiosk may not be defined and we don't want to fallback to logging with console.log
// to avoid unnecessary log spew in the test runs.
export const CLIENT_SIDE_LOG_SOURCES = [
  LogSource.VxAdminFrontend,
  LogSource.VxCentralScanFrontend,
  LogSource.VxScanFrontend,
  LogSource.VxBallotActivationFrontend,
  LogSource.VxMarkFrontend,
  LogSource.VxMarkScanFrontend,
];
