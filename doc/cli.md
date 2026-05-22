# dynamic-node-cli 使用指南

## 1. 安装

### 从源码安装

```bash
git clone https://github.com/aura-studio/dynamic-node-cli.git
cd dynamic-node-cli
bash build.sh install
```

执行后 `dynamic-node` 会通过 npm 安装为全局命令。

### 打包发布

```bash
bash build.sh release
```

产物输出到 `dist/` 目录。

## 2. 前置依赖

| 依赖 | 说明 |
|------|------|
| Node.js 18+ | 运行 CLI 本身，并构建目标项目 |
| npm | 安装 CLI 依赖和目标项目依赖 |
| AWS 凭证 | push/pull 时需要，通过环境变量或 `~/.aws/credentials` 配置 |

> esbuild 以 Node.js 依赖形式安装，无需额外安装 Go 工具链。

## 3. 配置文件

CLI 默认在当前目录依次查找 `dynamic-node-cli.yaml`、`dynamic-node-cli.yml`、`dynamic-cli.yaml`、`dynamic-cli.yml`，也可以用 `-c` 指定路径。

### 最小示例

```yaml
environments:
  - name: default
    toolchain:
      os: ubuntu22.04
      arch: amd64v1
      compiler: node22.11.0    # 精确版本匹配
      variant: bundle          # bundle = esbuild 打包；full = 全量 zip
    warehouse:
      local: /tmp/warehouse
      remote:
        - s3://my-bucket

procedures:
  - name: my-app
    environment: default
    source:
      module: ./src            # 模块根目录或仓库路径
      package: app             # 模块内包路径，入口固定为 index.js
      version: latest
    target:
      namespace: myteam
      package: app
      version: v1.0.0
```

### 字段说明

**environments**

| 字段 | 说明 | 示例 |
|------|------|------|
| `name` | 环境标识 | `default` |
| `toolchain.os` | 目标操作系统 | `ubuntu22.04`、`darwin14.2.1` |
| `toolchain.arch` | 目标架构 | `amd64v1`、`arm64v8` |
| `toolchain.compiler` | Node.js 版本 | `node22.11.0`（精确匹配） |
| `toolchain.variant` | 构建方式 | `bundle` 或 `full` |
| `warehouse.local` | 本地仓库路径 | `/tmp/warehouse` |
| `warehouse.remote` | S3 远程仓库列表 | `s3://my-bucket` |

**procedures**

| 字段 | 说明 | 示例 |
|------|------|------|
| `name` | 过程名称 | `my-app` |
| `environment` | 引用的 environment 名称 | `default` |
| `source.module` | 模块根目录或仓库路径 | `./src`、`codeup.aliyun.com/mirror/scp/scp-api/notification` |
| `source.package` | 模块内包路径 | `app`、`module/admin` |
| `source.version` | 版本标签 | `latest`、`1.0.0` |
| `target.namespace` | 产物命名空间 | `myteam` |
| `target.package` | 产物包名 | `app` |
| `target.version` | 产物版本号 | `v1.0.0` |

### 产物输出路径

```text
<warehouse.local>/<os>_<arch>_<compiler>_<variant>/<namespace>_<package>_<version>/
  libnode_<namespace>_<package>_<version>.zip
  libnode_<namespace>_<package>_<version>.zip.2024-05-19T10:30:00Z
```

## 4. 命令参考

### 4.1 build

构建 Node.js 项目为 zip 包。

```bash
dynamic-node build [-c <config>] [-p <procedure>]
```

| 参数 | 缩写 | 说明 | 默认值 |
|------|------|------|--------|
| `--config` | `-c` | 配置文件路径 | `./dynamic-node-cli.yaml`、`.yml`、`./dynamic-cli.yaml` 或 `.yml` |
| `--procedure` | `-p` | 指定 procedure | 为空则构建全部 |

**构建流程取决于 `variant`：**

- **`bundle`**：在 `<source.module>/<source.package>` 执行 `npm install` -> 通过 esbuild 将 `index.js` bundle 为单个 `bundle.js` -> 打包为 zip
- **`full`**：在 `<source.module>/<source.package>` 执行 `npm install` -> 将整个项目目录（含 `node_modules`）打包为 zip

构建前会自动检查当前机器的 OS、Arch、Compiler 是否匹配配置，不匹配则跳过。

### 4.2 push

将本地仓库中的 `.zip` 产物上传到 S3。

```bash
dynamic-node push [-c <config>] [-p <procedure>]
```

遍历 warehouse 本地目录，将匹配的 `.zip` 文件（含时间戳备份）上传至配置的所有 remote。远程路径与本地仓库路径保持一致。

### 4.3 pull

从 S3 仓库拉取主产物到本地。

```bash
dynamic-node pull [-c <config>] [-p <procedure>] [-j <concurrency>] [-f] [--remote <remote>]
```

| 参数 | 缩写 | 说明 | 默认值 |
|------|------|------|--------|
| `--config` | `-c` | 配置文件路径 | `./dynamic-node-cli.yaml`、`.yml`、`./dynamic-cli.yaml` 或 `.yml` |
| `--procedure` | `-p` | 指定 procedure | 为空则拉取全部 |
| `--concurrency` | `-j` | 最大并发下载数 | `8` |
| `--force` | `-f` | 强制覆盖本地已有文件 | `false` |
| `--remote` | | 指定单个 remote（覆盖配置） | 使用配置中的所有 remote |

### 4.4 clean

清理仓库产物。clean 命令包含 4 个子命令：

```bash
dynamic-node clean <subcommand> [-c <config>] [-p <procedure>]
```

- `clean all`：删除 warehouse 目录下的所有内容
- `clean cache`：删除非 `.zip` 文件，保留 `.zip` 产物及其备份
- `clean package`：删除所有 `.zip` 文件及其带日期的备份
- `clean useless`：删除所有非主 `.zip` 文件

### 4.5 toolchain

工具链检测与描述。

```bash
dynamic-node toolchain check -c <config> -p <procedure>
dynamic-node toolchain describe [os|arch|compiler|all]
```

`toolchain check` 的 `-p` 参数是必须的，因为需要知道检查哪个 procedure 对应的环境。

输出示例：

```text
pass: OS match (target=ubuntu22.04 actual=ubuntu22.04)
pass: ARCH match (target=amd64v1 actual=amd64v1)
pass: COMPILER match (target=node22.11.0 actual=node22.11.0)
```

### 4.6 version

输出 CLI 版本号、Node.js 版本和系统信息。

```bash
dynamic-node version
```

输出示例：

```text
Version: dev
Node:    v22.11.0 linux/x64
```

版本号可通过环境变量注入：

```bash
VERSION=v1.0.0 dynamic-node version
```

## 5. 典型工作流

```bash
# 1. 编写配置
vim dynamic-node-cli.yaml

# 2. 检查工具链是否匹配
dynamic-node toolchain check -p my-app

# 3. 构建
dynamic-node build -p my-app

# 4. 推送到 S3
dynamic-node push -p my-app
```

## 6. Compiler 匹配规则

`toolchain.compiler` 字段要求精确匹配 Node.js 版本号。

| 配置值 | 匹配方式 | 示例 |
|--------|---------|------|
| `node22.11.0` | 精确匹配完整版本号 | 仅本地 v22.11.0 通过 |

## 7. 构建方式对比

| | `variant: bundle` | `variant: full` |
|---|---|---|
| 流程 | npm install -> esbuild bundle -> zip | npm install -> 整个目录 zip |
| 产物体积 | 小（通常 < 5 MB） | 大（几十 ~ 几百 MB） |
| 加载速度 | 快（单文件 require） | 中等（解压 + 目录扫描） |
| 兼容性 | 好（90%+ 项目） | 最好（native addon 可用） |
| 适用场景 | 纯 JS/TS 项目 | 含 native addon 的项目 |

默认推荐使用 `bundle`。如果项目使用 native addon（如 `better-sqlite3`）、依赖 `__dirname`/`__filename`、或使用动态 `require` 路径，应切换到 `full`。
