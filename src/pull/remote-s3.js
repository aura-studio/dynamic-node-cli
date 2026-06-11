import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { createS3ClientConfig } from "../s3/client-config.js";
import { ensureExtracted } from "./extract.js";

export class S3Remote {
  constructor(remote) {
    let value = remote.trim().replace(/^s3:\/\//, "");
    let prefix = "";
    const slash = value.indexOf("/");
    if (slash >= 0) {
      prefix = value.slice(slash + 1).replace(/^\/+|\/+$/g, "");
      value = value.slice(0, slash);
    }

    this.bucket = value;
    this.prefix = prefix;
  }

  createS3Client() {
    return new S3Client(createS3ClientConfig());
  }

  async pullArtifacts(environment, name, localWarehouse, opt) {
    const client = this.createS3Client();

    const remoteDir = path.posix.join(environment, name);
    let listPrefix = remoteDir;
    if (this.prefix) {
      listPrefix = path.posix.join(this.prefix, remoteDir);
    }

    const keys = await this.listMatchingKeys(client, listPrefix, name);
    if (keys.length === 0) {
      throw new Error(
        `no matching artifacts found under s3://${this.bucket}/${listPrefix}`,
      );
    }

    const tasks = keys.map((fullKey) => {
      let relKey = fullKey;
      if (this.prefix) {
        const prefixWithSlash = `${this.prefix.replace(/^\/+|\/+$/g, "")}/`;
        relKey = fullKey.startsWith(prefixWithSlash)
          ? fullKey.slice(prefixWithSlash.length)
          : fullKey;
      }

      return {
        key: fullKey,
        localPath: path.join(localWarehouse, pathFromSlash(relKey)),
      };
    });

    return this.downloadTasks(client, tasks, opt);
  }

  async listMatchingKeys(client, listPrefix, name) {
    const libnodeName = `libnode_${name}.zip`;
    const keys = [];
    let continuationToken;

    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: listPrefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of page.Contents ?? []) {
        if (!obj.Key) {
          continue;
        }
        const base = path.posix.basename(obj.Key);
        if (base === libnodeName) {
          keys.push(obj.Key);
        }
      }

      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);

    return keys;
  }

  async downloadTasks(client, tasks, opt) {
    if (opt.concurrency <= 0) {
      opt.concurrency = 8;
    }

    const errors = [];
    let success = 0;
    let next = 0;

    const worker = async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= tasks.length) {
          return;
        }

        const task = tasks[index];
        if (!opt.force && fs.existsSync(task.localPath)) {
          try {
            ensureExtracted(task.localPath, false);
            success += 1;
          } catch (err) {
            errors.push(err);
          }
          continue;
        }

        try {
          await fs.promises.mkdir(path.dirname(task.localPath), {
            recursive: true,
            mode: 0o755,
          });
          await this.downloadOne(client, task.key, task.localPath);
          ensureExtracted(task.localPath, true);
          success += 1;
        } catch (err) {
          errors.push(err);
        }
      }
    };

    await Promise.all(
      Array.from({ length: opt.concurrency }, () => worker()),
    );

    if (errors.length > 0) {
      throw joinErrors(errors);
    }
    return success;
  }

  async downloadOne(client, key, localPath) {
    const out = await client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    const dir = path.dirname(localPath);
    const base = path.basename(localPath);
    const tmpName = path.join(
      dir,
      `${base}.tmp.${process.pid}.${Date.now()}.${Math.random()
        .toString(16)
        .slice(2)}`,
    );

    try {
      await pipeline(out.Body, fs.createWriteStream(tmpName));
      await fs.promises.rename(tmpName, localPath);
    } catch (err) {
      await fs.promises.rm(tmpName, { force: true }).catch(() => {});
      throw new Error(`download s3://${this.bucket}/${key}: ${err.message}`);
    }
  }
}

function pathFromSlash(value) {
  return value.split("/").join(path.sep);
}

function joinErrors(errors) {
  const filtered = errors.filter(Boolean);
  if (filtered.length === 0) {
    return null;
  }
  if (filtered.length === 1) {
    return filtered[0];
  }
  return new Error(
    `multiple errors:${filtered.map((err) => `\n - ${err.message}`).join("")}`,
  );
}
