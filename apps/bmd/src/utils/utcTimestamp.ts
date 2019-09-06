// returns current UTC unix timestamp (epoch) in seconds
const utcTimestamp = (): number => Math.round(Date.now() / 1000)
export default utcTimestamp
