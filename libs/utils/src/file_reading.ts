import JsZip, { JSZipObject } from 'jszip';
import { Buffer } from 'node:buffer';

export function readFileAsyncAsString(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const { result } = reader;
      resolve(typeof result === 'string' ? result : '');
    };
    reader.onerror = () => {
      reject(reader.error);
    };
    reader.readAsText(file);
  });
}

export function readFile(file: File): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror =
      /* istanbul ignore next */
      () => {
        reject(reader.error);
      };

    reader.onload = () => {
      if (!reader.result) {
        resolve(Buffer.from([]));
        return;
      }

      resolve(Buffer.from(reader.result as ArrayBuffer));
    };

    reader.readAsArrayBuffer(file);
  });
}

export async function openZip(data: Uint8Array): Promise<JsZip> {
  return await new JsZip().loadAsync(data);
}

export function getEntries(zipfile: JsZip): JSZipObject[] {
  return Object.values(zipfile.files);
}

export function getEntryStream(entry: JSZipObject): NodeJS.ReadableStream {
  return entry.nodeStream();
}

export async function readEntry(entry: JSZipObject): Promise<Buffer> {
  return entry.async('nodebuffer');
}

export async function readTextEntry(entry: JSZipObject): Promise<string> {
  const bytes = await readEntry(entry);
  return new TextDecoder().decode(bytes);
}

export async function readJsonEntry(entry: JSZipObject): Promise<unknown> {
  return JSON.parse(await readTextEntry(entry));
}

/**
 * Finds the most recently modified file in the entries that matches the given prefix and extension.
 * @param entries - represents the entries of a zip file
 * @param prefix - the prefix the file name should start with
 * @param extension - the file extension (including the dot, e.g. ".json")
 * @param zipName - human-readable name of the zip file for use in error handling
 * @returns the JSZipObject of the most recently modified matching file
 * @throws if no matching file is found
 */
export function getFilePrefixedByName(
  entries: JSZipObject[],
  prefix: string,
  extension: string,
  zipName = 'Zip object'
): JSZipObject {
  const matching = entries.filter(
    (entry) => entry.name.startsWith(prefix) && entry.name.endsWith(extension)
  );
  if (matching.length === 0) {
    throw new Error(
      `${zipName} does not have a file starting with '${prefix}' and ending with '${extension}'`
    );
  }
  // Choose the most recently modified file (by date, fallback to last in list)
  const sortedMatching = matching.slice().sort((a, b) => {
    const aDate = a.date?.getTime?.() ?? 0;
    const bDate = b.date?.getTime?.() ?? 0;
    return bDate - aDate;
  });
  if (sortedMatching[0] === undefined) {
    throw new Error(
      `${zipName} does not have a file starting with '${prefix}' and ending with '${extension}'`
    );
  }

  return sortedMatching[0];
}

/**
 * Finds a file in the entries by its name.
 * @param name - the target file to find in the entries
 * @param [zipName] - human-readable name zip file for use in error handling
 * @returns contents of the target file as a JSZipObject
 */
export function getFileByName(
  entries: JSZipObject[],
  name: string,
  zipName = 'Zip object'
): JSZipObject {
  const result = entries.find((entry) => entry.name === name);

  if (!result) {
    throw new Error(`${zipName} does not have a file called '${name}'`);
  }

  return result;
}

/**
 * @param entries - represents the entries of a zip file
 * @param name - the target file to find in the entries
 * @returns a JSZipObject representing the file or undefined if no file exists in the zip
 */
export function maybeGetFileByName(
  entries: JSZipObject[],
  name: string
): JSZipObject | undefined {
  return entries.find((entry) => entry.name === name);
}
