/**
 * @param {() => void} callback
 * @param {number} delay
 */
const useInterval = (callback, delay) => {
  const savedCallback = /** @type {import("react").MutableRefObject<(() => void) | null>} */ (React.useRef(
    null
  ))

  React.useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  React.useEffect(() => {
    function tick() {
      savedCallback.current?.()
    }
    if (delay !== null) {
      const id = setInterval(tick, delay)
      return () => clearInterval(id)
    }
  }, [delay])
}

export default useInterval
