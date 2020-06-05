const sleep = (ms: number = 1000) =>
  new Promise(resolve => setTimeout(resolve, ms))

export default sleep
