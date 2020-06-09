export const eject = () => {
  fetch('/usbstick/eject', {
    method: 'post',
  })
}

export const status = () => {
  fetch('/usbstick/status', {
    method: 'post',
  })
}
