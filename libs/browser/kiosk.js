// @ts-check

(() => {
  /**
   * @param {import("./types").IpcMessage} message
   */
  function postMessage(message) {
    window.webkit.messageHandlers.ipc.postMessage(JSON.stringify(message));
  }

  /**
   * @returns {string}
   */
  function nextId() {
    return Math.random().toString(36).slice(2);
  }

  /**
   * @param {import("./types").IpcMessage} message
   * @returns {Promise<import("./types").IpcReply>}
   */
  function rpc(message) {
    return new Promise((resolve, reject) => {
      // @ts-ignore - this is a valid property
      const { replyTo } = message;

      /**
       * @param {MessageEvent<import("./types").IpcReply>} reply
       */
      const listener = ({ data }) => {
        if (data.type === 'Error') {
          reject(data.message);
        } else if (data.inReplyTo === replyTo) {
          window.removeEventListener('message', listener);
          resolve(data);
        }
      };

      window.addEventListener('message', listener);
      postMessage(message);
    });
  }

  window.kiosk = {
    log(message) {
      postMessage({ type: 'Log', message });
    },

    quit() {
      postMessage({ type: 'Quit' });
    },

    async captureScreenshot() {
      const reply = await rpc({ type: 'CaptureScreenshot', replyTo: nextId() });

      if (reply.type !== 'CaptureScreenshot') {
        throw new Error('Unexpected reply type');
      }

      return Uint8Array.fromBase64(reply.data);
    },

    async showOpenDialog(options) {
      const reply = await rpc({
        type: 'ShowOpenDialog',
        ...options,
        replyTo: nextId(),
      });

      if (reply.type !== 'ShowOpenDialog') {
        throw new Error('Unexpected reply type');
      }

      const { canceled, filePaths } = reply;
      return { canceled, filePaths };
    },
  };
})();
