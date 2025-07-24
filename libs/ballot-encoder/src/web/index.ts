import jsQR from 'jsqr';
import { toByteArray } from 'base64-js';
import {
  decodeBallotHashFromReader,
  decodeUnresolvedBallotConfigFromReader,
  UnresolvedBallotConfig,
} from '../index';
import { BitReader } from '../bits';

const POLLING_INTERVAL_MS = 200;

async function run() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
  });

  const $video = document.getElementById('viewfinder') as HTMLVideoElement;
  $video.srcObject = stream;

  const $canvas = document.createElement('canvas');
  const context = $canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new Error('Could not create canvas context');
  }

  function tryToFindQrCode() {
    if ($video.videoWidth !== 0 && $video.videoHeight !== 0) {
      $canvas.width = $video.videoWidth;
      $canvas.height = $video.videoHeight;
      context!.drawImage($video, 0, 0, $canvas.width, $canvas.height);
      const imageData = context!.getImageData(
        0,
        0,
        $canvas.width,
        $canvas.height
      );

      const qrcode = jsQR(imageData.data, imageData.width, imageData.height);

      if (qrcode?.data) {
        const $qrcodeInfoOverlay = document.querySelector(
          '.qrcode-info .overlay'
        ) as HTMLHtmlElement;
        $qrcodeInfoOverlay.classList.remove('hidden');

        const $rawData = $qrcodeInfoOverlay.querySelector(
          '.raw-data'
        ) as HTMLHtmlElement;
        const $rawDataValue = $rawData.querySelector(
          '.value'
        ) as HTMLHtmlElement;
        $rawDataValue.textContent = qrcode.data;
        $rawDataValue.dataset['copyable'] = qrcode.data;

        const $decodedBase64 = $qrcodeInfoOverlay.querySelector(
          '.decoded-base64'
        ) as HTMLHtmlElement;

        let decoded: Uint8Array | undefined;
        try {
          decoded = toByteArray(qrcode.data);
        } catch (e) {
          console.warn('Data is not Base64:', qrcode.data, e);
        }

        const $decodedBase64Value = $decodedBase64.querySelector(
          '.value'
        ) as HTMLHtmlElement;
        const debugBytes = decoded
          ? [...decoded]
              .map((byte) => byte.toString(16).padStart(2, '0'))
              .join(' ')
          : '';
        $decodedBase64Value.textContent = debugBytes ?? 'n/a';
        $decodedBase64Value.dataset['copyable'] = debugBytes;

        let ballotHash: string | undefined;
        let ballotConfig: UnresolvedBallotConfig | undefined;
        if (decoded) {
          try {
            const bits = new BitReader(decoded);
            ballotHash = decodeBallotHashFromReader(bits);
            if (ballotHash) {
              ballotConfig = decodeUnresolvedBallotConfigFromReader(bits, {
                readPageNumber: true,
              });
            }
          } catch (e) {
            console.warn('Data is not a ballot:', e);
          }
        }

        const $ballotHash = $qrcodeInfoOverlay.querySelector(
          '.ballot-hash'
        ) as HTMLHtmlElement;
        const $ballotHashValue = $ballotHash.querySelector(
          '.value'
        ) as HTMLHtmlElement;

        $ballotHashValue.textContent = ballotHash ?? 'n/a';
        $ballotHashValue.dataset['copyable'] = ballotHash;

        const $ballotId = $qrcodeInfoOverlay.querySelector(
          '.ballot-id'
        ) as HTMLHtmlElement;
        const $ballotIdValue = $ballotId.querySelector(
          '.value'
        ) as HTMLHtmlElement;

        $ballotIdValue.textContent = ballotConfig?.ballotAuditId ?? 'n/a';
        $ballotIdValue.dataset['copyable'] = ballotConfig?.ballotAuditId;
      }
    }

    window.setTimeout(tryToFindQrCode, POLLING_INTERVAL_MS);
  }

  tryToFindQrCode();
}

function setupCopyButtons() {
  for (const $button of document.getElementsByClassName('copy-button')) {
    const $value = $button.parentElement?.getElementsByClassName(
      'value'
    )[0] as HTMLHtmlElement;

    if ($value) {
      $button.textContent = 'Copy';
      $button.addEventListener('click', async (e) => {
        e.preventDefault();
        const copyable = $value.dataset['copyable'];
        if (copyable) {
          await navigator.clipboard.writeText(copyable);
          $button.classList.add('success');
          await new Promise((resolve) => setTimeout(resolve, 1000));
          $button.classList.remove('success');
        }
      });
    }
  }
}

setupCopyButtons();
run().catch((e) => alert(e));
