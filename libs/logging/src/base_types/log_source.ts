export enum LogSource {
  System = 'system',
  VxAdminFrontend = 'vx-admin-frontend',
  VxAdminService = 'vx-admin-service',
  VxCentralScanFrontend = 'vx-central-scan-frontend',
  VxCentralScanService = 'vx-central-scan-service',
  VxScanFrontend = 'vx-scan-frontend',
  VxScanBackend = 'vx-scan-backend',
  VxMarkFrontend = 'vx-mark-frontend',
  VxMarkBackend = 'vx-mark-backend',
  VxMarkScanFrontend = 'vx-mark-scan-frontend',
  VxMarkScanBackend = 'vx-mark-scan-backend',
  VxMarkScanPatDaemon = 'vx-mark-scan-pat-daemon',
  VxMarkScanControllerDaemon = 'vx-mark-scan-controller-daemon',
  VxBallotActivationFrontend = 'vx-ballot-activation-frontend',
  VxBallotActivationService = 'vx-ballot-activation-service',
  VxScanService = 'vx-scan-service',
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
