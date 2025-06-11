export interface AudioControls {
  cycleVolume: () => void;
  decreasePlaybackRate: () => void;
  decreaseVolume: () => void;
  increasePlaybackRate: () => void;
  increaseVolume: () => void;
  replay: () => void;
  reset: () => void;
  setControlsEnabled: (enabled: boolean) => void;
  setIsEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
  togglePause: () => void;
}
