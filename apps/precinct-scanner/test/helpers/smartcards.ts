export const adminCardForElection = (electionHash: string): string =>
  JSON.stringify({
    t: 'admin',
    h: electionHash,
  })
