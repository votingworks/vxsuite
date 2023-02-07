// TODO: Replace with library: https://github.com/votingworks/bas/issues/16
import { useEffect } from 'react';

export function useInterval(callback: () => void, delay: number): void {
  useEffect(() => {
    const id = setInterval(callback, delay);
    return () => clearInterval(id);
  }, [callback, delay]);
}
