import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

export async function listZipEntries(zipPath) {
  const buffer = await fs.promises.readFile(zipPath);
  return readCentralDirectory(buffer).map((entry) => ({
    name: entry.name,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    compressionMethod: entry.compressionMethod,
  }));
}

export async function readZipEntry(zipPath, entryName) {
  const buffer = await fs.promises.readFile(zipPath);
  const entry = readCentralDirectory(buffer).find((item) => item.name === entryName);
  if (!entry) {
    return null;
  }
  return readEntryData(buffer, entry);
}

export async function extractZip(zipPath, destDir) {
  const buffer = await fs.promises.readFile(zipPath);
  const entries = readCentralDirectory(buffer);
  const root = path.resolve(destDir);

  for (const entry of entries) {
    const target = path.resolve(root, entry.name.split("/").join(path.sep));
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error(`zip entry escapes target directory: ${entry.name}`);
    }

    if (entry.name.endsWith("/")) {
      await fs.promises.mkdir(target, { recursive: true, mode: 0o755 });
      continue;
    }

    const data = readEntryData(buffer, entry);
    await fs.promises.mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
    await fs.promises.writeFile(target, data);
  }
}

function readCentralDirectory(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const end = centralDirectoryOffset + centralDirectorySize;
  const entries = [];
  let offset = centralDirectoryOffset;

  while (offset < end) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("invalid zip central directory");
    }

    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    const encoding = flags & (1 << 11) ? "utf8" : "utf8";
    const name = buffer.toString(encoding, nameStart, nameEnd);

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset = nameEnd + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  throw new Error("invalid zip: end of central directory not found");
}

function readEntryData(buffer, entry) {
  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== LOCAL_FILE_SIGNATURE) {
    throw new Error(`invalid zip local header for ${entry.name}`);
  }

  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  switch (entry.compressionMethod) {
    case 0:
      return Buffer.from(compressed);
    case 8:
      return zlib.inflateRawSync(compressed);
    default:
      throw new Error(
        `unsupported zip compression method ${entry.compressionMethod} for ${entry.name}`,
      );
  }
}
