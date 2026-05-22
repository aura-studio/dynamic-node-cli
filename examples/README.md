# examples manual test guide

这个目录提供一个最小 Node.js 示例工程和一组手动测试脚本。

## 默认值

脚本默认使用：

```bash
AWS_PROFILE=aws-3
AWS_REGION=us-west-1
DYNAMIC_NODE_TEST_ID=manual
DYNAMIC_NODE_TEST_REMOTE=s3://dynamic-loader-code-255491288557/dynamic-node-cli-test/manual
```

如果要换成自己的测试 bucket：

```bash
export AWS_PROFILE=aws-3
export AWS_REGION=us-west-1
export DYNAMIC_NODE_TEST_ID="$(date -u +%Y%m%dT%H%M%SZ)"
export DYNAMIC_NODE_TEST_REMOTE="s3://your-bucket/dynamic-node-cli-test/${DYNAMIC_NODE_TEST_ID}"
```

## 推荐手动顺序

从仓库根目录逐条执行：

```bash
./examples/scripts/00-create-config.sh
./examples/scripts/01-smoke.sh
./examples/scripts/02-toolchain-check.sh
./examples/scripts/03-build-bundle.sh
./examples/scripts/04-build-full.sh
./examples/scripts/05-build-all.sh
./examples/scripts/06-push.sh
./examples/scripts/07-pull.sh
./examples/scripts/08-clean-cache.sh
./examples/scripts/09-clean-useless.sh
./examples/scripts/10-clean-package.sh
./examples/scripts/11-clean-all.sh
./examples/scripts/12-install-from-github.sh
./examples/scripts/13-clean-s3.sh
```

本地测试不需要 AWS：

```bash
./examples/scripts/99-run-all-local.sh
```

包含 S3 push/pull 的完整测试：

```bash
./examples/scripts/99-run-all-with-s3.sh
```

`99-run-all-with-s3.sh` 默认会在结束时清理 `DYNAMIC_NODE_TEST_REMOTE` 对应的 S3 前缀。想保留远程产物时：

```bash
export DYNAMIC_NODE_TEST_KEEP_REMOTE=1
./examples/scripts/99-run-all-with-s3.sh
```

## 产物

运行脚本会生成：

```text
examples/dynamic-node-cli.yaml
examples/warehouse/
examples/sample-app/node_modules/
examples/sample-app/package-lock.json
```

这些文件已被 `examples/.gitignore` 忽略。
