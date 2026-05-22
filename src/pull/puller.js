import { S3Remote } from "./remote-s3.js";

export function newRemote(value) {
  const url = new URL(value.includes("://") ? value : `s3://${value}`);

  switch (url.protocol.replace(/:$/, "")) {
    case "":
    case "s3":
      return new S3Remote(value);
    default:
      throw new Error(`pull: unknown remote scheme: ${url.protocol.replace(/:$/, "")}`);
  }
}
