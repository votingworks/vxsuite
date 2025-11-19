export const systemAdministratorRoutes = {
  settings: { title: 'Settings', path: '/settings' },
} satisfies Record<string, { title: string; path: string }>;

export const electionManagerRoutes = {
  election: { title: 'Election', path: '/election' },
  print: { title: 'Print', path: '/print' },
  reports: { title: 'Reports', path: '/reports' },
  settings: { title: 'Settings', path: '/settings' },
} satisfies Record<string, { title: string; path: string }>;

export const pollWorkerRoutes = {
  print: { title: 'Print', path: '/print' },
  reports: { title: 'Reports', path: '/reports' },
} satisfies Record<string, { title: string; path: string }>;

export const routeMap = {
  system_admin: systemAdministratorRoutes,
  election_manager: electionManagerRoutes,
  poll_worker: pollWorkerRoutes,
} as const;
