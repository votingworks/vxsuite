/* eslint-disable max-classes-per-file */
import { assert } from '@votingworks/utils';
import { Buffer } from 'buffer';
import path from 'path';
import { configure, Uint8ArrayReader, ZipWriter, Writer } from '@zip.js/zip.js';

configure({ useWebWorkers: false });

/**
 * Forwards data from a `ZipWriter` to a kiosk-browser file writer.
 */
class KioskBrowserZipFileWriter extends Writer {
  constructor(private readonly fileWriter: KioskBrowser.FileWriter) {
    super();
  }

  /**
   * Called whenever there is new data to write to the zip file.
   */
  async writeUint8Array(array: Uint8Array): Promise<void> {
    await super.writeUint8Array(array);
    await this.fileWriter.write(array);
  }

  /**
   * This function is required by the ZipWriter interface, but we ignore its
   * return value. It is called when closing the zip file.
   */
  async getData(): Promise<Uint8Array> {
    return Promise.resolve(Uint8Array.of());
  }
}

/**
 * Provides support for downloading a Zip archive of files. Requires
 * the page is running inside `kiosk-browser` and that it is configured such
 * that the executing host is allowed to use the `saveAs` API.
 */
export class DownloadableArchive {
  private writer?: ZipWriter;

  constructor(private readonly kiosk = window.kiosk) {}

  private getKiosk(): KioskBrowser.Kiosk {
    assert(this.kiosk);
    return this.kiosk;
  }

  /**
   * Begins downloading an archive by prompting the user where to put it and
   * making this instance ready to receive files. Resolves when ready to receive
   * files.
   */
  async beginWithDialog(options?: KioskBrowser.SaveAsOptions): Promise<void> {
    const fileWriter = await this.getKiosk().saveAs(options);

    if (!fileWriter) {
      throw new Error('could not begin download; no file was chosen');
    }

    this.prepareZip(fileWriter);
  }

  /**
   * Begins downloading an archive to the filePath specified. Resolves when
   * ready to receive files.
   */
  async beginWithDirectSave(
    pathToFolder: string,
    filename: string
  ): Promise<void> {
    await this.getKiosk().makeDirectory(pathToFolder, {
      recursive: true,
    });
    const filePath = path.join(pathToFolder, filename);
    const fileWriter = await this.getKiosk().writeFile(filePath);

    if (!fileWriter) {
      throw new Error('could not begin download; an error occurred');
    }

    this.prepareZip(fileWriter);
  }

  /**
   * Prepares the zip archive for writing to the given file writer.
   */
  private prepareZip(fileWriter: KioskBrowser.FileWriter): void {
    this.writer = new ZipWriter(new KioskBrowserZipFileWriter(fileWriter));
  }

  /**
   * Writes a file to the archive, resolves when complete.
   */
  async file(name: string, data: string | Buffer): Promise<void> {
    const { writer } = this;

    if (!writer) {
      throw new Error('cannot call file() before begin()');
    }

    await writer.add(name, new Uint8ArrayReader(Buffer.from(data)));
  }

  /**
   * Finishes the zip archive and ends the download.
   */
  async end(): Promise<void> {
    if (!this.writer) {
      throw new Error('cannot call end() before begin()');
    }

    await this.writer.close();
    this.writer = undefined;
  }
}
