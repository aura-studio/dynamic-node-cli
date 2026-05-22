import fs from "node:fs";
import path from "node:path";
import {
  GetBucketLocationCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export class S3Remote {
  constructor(bucket) {
    let value = bucket.trim().replace(/^s3:\/\//, "");
    let prefix = "";
    const slash = value.indexOf("/");
    if (slash >= 0) {
      prefix = value.slice(slash + 1).replace(/^\/+|\/+$/g, "");
      value = value.slice(0, slash);
    }

    this.bucket = value;
    this.prefix = prefix;
  }

  async createS3Client() {
    let client = new S3Client({ region: "us-east-1" });
    let output;

    try {
      output = await client.send(
        new GetBucketLocationCommand({
          Bucket: this.bucket,
        }),
      );
    } catch (err) {
      console.error(
        `warning: failed to get bucket location for ${this.bucket}, using default region: ${err.message}`,
      );
      return client;
    }

    const region = normalizeRegion(output.LocationConstraint);
    client = new S3Client({ region });
    return client;
  }

  async uploadFileToS3(remoteFilePath, localFilePath) {
    const client = await this.createS3Client();
    let key = remoteFilePath;
    if (this.prefix) {
      key = path.posix.join(this.prefix, key);
    }

    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fs.createReadStream(localFilePath),
      }),
    );
  }

  async batchUploadFilesToS3(pairs) {
    const errors = [];

    await Promise.all(
      pairs.map(async (pair) => {
        const { localFilePath, remoteFilePath } = pair;
        let stat;

        try {
          stat = await fs.promises.stat(localFilePath);
        } catch (err) {
          console.error(`${localFilePath} does not exist`);
          errors.push(err);
          return;
        }

        if (stat.size === 0) {
          console.error(`${localFilePath} is empty`);
          errors.push(new Error(`${localFilePath} is empty`));
          return;
        }

        const fullKey = this.prefix
          ? path.posix.join(this.prefix, remoteFilePath)
          : remoteFilePath;
        console.error(
          `${localFilePath} found, uploading to s3://${this.bucket}/${fullKey}...`,
        );

        try {
          await this.uploadFileToS3(remoteFilePath, localFilePath);
        } catch (err) {
          console.error(`failed to upload file to s3, ${err.message}`);
          errors.push(err);
        }
      }),
    );

    if (errors.length > 0) {
      throw new Error(`${errors.length} errors occurred during uploading`);
    }
  }

  async push(tasks) {
    await this.batchUploadFilesToS3(tasks);
  }
}

function normalizeRegion(locationConstraint) {
  if (!locationConstraint) {
    return "us-east-1";
  }
  if (locationConstraint === "EU") {
    return "eu-west-1";
  }
  return locationConstraint;
}
