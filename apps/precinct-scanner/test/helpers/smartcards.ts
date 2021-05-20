export const adminCardForElection = (electionHash: string): string =>
  JSON.stringify({
    t: 'admin',
    h: electionHash,
  })

export const pollWorkerCardForElection = (electionHash: string): string =>
  JSON.stringify({
    t: 'pollworker',
    h: electionHash,
  })

export const getVoterCard = (): string =>
  JSON.stringify({
    t: 'voter',
  })
