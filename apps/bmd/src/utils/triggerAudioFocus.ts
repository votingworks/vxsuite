function triggerAudioFocus(): void {
  const element = document.getElementById('audiofocus');
  if (element) {
    element.focus();
    element.click();
  }
}
export default triggerAudioFocus;
