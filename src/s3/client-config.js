export function createS3ClientConfig(region) {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3 ||
    process.env.AWS_ENDPOINT_URL ||
    process.env.DYNAMIC_NODE_S3_ENDPOINT ||
    "";
  const forcePathStyle = parseBool(
    process.env.AWS_S3_FORCE_PATH_STYLE ||
      process.env.S3_FORCE_PATH_STYLE ||
      process.env.DYNAMIC_NODE_S3_FORCE_PATH_STYLE ||
      endpoint,
  );

  return {
    ...(region ? { region } : {}),
    ...(endpoint ? { endpoint } : {}),
    ...(forcePathStyle ? { forcePathStyle: true } : {}),
  };
}

function parseBool(value) {
  if (!value) {
    return false;
  }
  const normalized = String(value).toLowerCase().trim();
  return !["0", "false", "no", "off"].includes(normalized);
}
