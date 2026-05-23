# dynamic-node-cli examples

This directory contains a small Tunnel package and step-by-step manual tests.
The recommended scripts are JavaScript entrypoints so they work on Windows,
macOS, and Linux.

## Quick local run

From the repository root:

```bash
npm run test:examples
```

This runs the local-only flow:

```bash
node examples/scripts/00-create-config.js
node examples/scripts/01-smoke.js
node examples/scripts/02-toolchain-check.js
node examples/scripts/03-build-bundle.js
node examples/scripts/04-build-full.js
node examples/scripts/05-build-all.js
node examples/scripts/14-meta.js
node examples/scripts/08-clean-cache.js
node examples/scripts/09-clean-useless.js
node examples/scripts/10-clean-package.js
node examples/scripts/11-clean-all.js
```

## S3-compatible Docker run

The S3 flow can run without a real AWS bucket by starting a MinIO container:

```bash
npm run test:examples:s3:docker
```

The script starts `minio/minio:latest`, creates a bucket, points the CLI at the
container through `AWS_ENDPOINT_URL`, runs build/push/pull/meta/clean tests, and
stops the container when finished.

Useful overrides:

```bash
set DYNAMIC_NODE_TEST_ID=manual
set DYNAMIC_NODE_TEST_S3_IMAGE=minio/minio:latest
set DYNAMIC_NODE_TEST_KEEP_DOCKER=1
```

On bash shells use `export` instead of `set`.

## Real S3 run

To run against an actual S3 bucket:

```bash
export AWS_PROFILE=aws-3
export AWS_REGION=us-west-1
export DYNAMIC_NODE_TEST_ID="$(date -u +%Y%m%dT%H%M%SZ)"
export DYNAMIC_NODE_TEST_REMOTE="s3://your-bucket/dynamic-node-cli-test/${DYNAMIC_NODE_TEST_ID}"
npm run test:examples:s3
```

The S3 script removes the remote prefix at the end unless
`DYNAMIC_NODE_TEST_KEEP_REMOTE=1` is set.

## Paths

Defaults:

```text
DYNAMIC_NODE_TEST_APP=examples/sample-app
DYNAMIC_NODE_TEST_WAREHOUSE=examples/warehouse
DYNAMIC_NODE_TEST_CONFIG=examples/dynamic-node-cli.yaml
DYNAMIC_NODE_TEST_ID=manual
DYNAMIC_NODE_TEST_REMOTE=s3://dynamic-node-cli-test/manual
```

Generated files are ignored by git:

```text
examples/dynamic-node-cli.yaml
examples/warehouse/
examples/sample-app/node_modules/
examples/sample-app/package-lock.json
```

The old `.sh` scripts are kept as bash conveniences, but the `.js` scripts are
the portable test entrypoints.
