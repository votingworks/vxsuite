export const systemAdministratorRoutes = {
  election: { title: 'Election', path: '/election' },
  settings: { title: 'Settings', path: '/settings' },
} satisfies Record<string, { title: string; path: string }>;

export const electionManagerRoutes = {
  print: { title: 'Print', path: '/print' },
  election: { title: 'Election', path: '/election' },
  settings: { title: 'Settings', path: '/settings' },
} satisfies Record<string, { title: string; path: string }>;

export const pollWorkerRoutes = {
  print: { title: 'Print', path: '/print' },
} satisfies Record<string, { title: string; path: string }>;

export const routeMap = {
  system_admin: systemAdministratorRoutes,
  election_manager: electionManagerRoutes,
  poll_worker: pollWorkerRoutes,
} as const;
