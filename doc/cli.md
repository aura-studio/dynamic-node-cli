# dynamic-node-cli 使用指南

## 1. 安装

### 从源码安装

```bash
git clone https://github.com/aura-studio/dynamic-node-cli.git
cd dynamic-node-cli
bash build.sh install
```

执行后 `dynamic-node` 会被安装到 `/usr/local/bin/`。

### 多平台构建

```bash
bash build.sh release
```

产物输出到 `dist/` 目录，支持 linux/amd64、linux/arm64、darwin/amd64、darwin/arm64、windows/amd64。

## 2. 前置依赖

| 依赖 | 说明 |
|------|------|
| Go 1.21+ | 编译 CLI 本身 |
| Node.js | 构建目标项目所需（`npm install`） |
| npm | 随 Node.js 附带 |
| AWS 凭证 | push/pull 时需要，通过环境变量或 `~/.aws/credentials` 配置 |

> esbuild 以 Go API 形式内嵌在二进制中，无需单独安装。

## 3. 配置文件

CLI 默认在当前目录查找 `dynamic-node-cli.yaml` 或 `dynamic-node-cli.yml`，也可以用 `-c` 指定路径。

### 最小示例

```yaml
environments:
  - name: default
    toolchain:
      os: ubuntu22.04
      arch: amd64v1
      compiler: node22        # 大版本匹配；精确匹配写 node22.11.0
      variant: bundle          # bundle = esbuild 打包；full = 全量 zip
    warehouse:
      local: /tmp/warehouse
      remote:
        - s3://my-bucket

procedures:
  - name: my-app
    environment: default
    source:
      path: ./src/app          # Node 项目路径（相对或绝对）
      entry: index.js          # 入口文件（相对于 source.path）
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
| `toolchain.compiler` | Node.js 版本 | `node22`（大版本）、`node22.11.0`（精确） |
| `toolchain.variant` | 构建方式 | `bundle` 或 `full` |
| `warehouse.local` | 本地仓库路径 | `/tmp/warehouse` |
| `warehouse.remote` | S3 远程仓库列表 | `s3://my-bucket` |

**procedures**

| 字段 | 说明 | 示例 |
|------|------|------|
| `name` | 过程名称 | `my-app` |
| `environment` | 引用的 environment 名称 | `default` |
| `source.path` | Node 项目源码路径 | `./src/app` |
| `source.entry` | 入口文件 | `index.js` |
| `source.version` | 版本标签 | `latest`、`1.0.0` |
| `target.namespace` | 产物命名空间 | `myteam` |
| `target.package` | 产物包名 | `app` |
| `target.version` | 产物版本号 | `v1.0.0` |

### 产物输出路径

```
<warehouse.local>/<os>_<arch>_<compiler>_<variant>/<namespace>_<package>_<version>/
  libnode_<namespace>_<package>_<version>.zip                    # 主产物
  libnode_<namespace>_<package>_<version>.zip.2024-05-19T103000Z # 带时间戳备份
```

例如：

```
/tmp/warehouse/ubuntu22.04_amd64v1_node22_bundle/myteam_app_v1.0.0/
  libnode_myteam_app_v1.0.0.zip
  libnode_myteam_app_v1.0.0.zip.2024-05-19T103000Z
```

## 4. 命令参考

### 4.1 build

构建 Node.js 项目为 zip 包。

```bash
dynamic-node build [-c <config>] [-p <procedure>]
```

| 参数 | 缩写 | 说明 | 默认值 |
|------|------|------|--------|
| `--config` | `-c` | 配置文件路径 | `./dynamic-node-cli.yaml` 或 `.yml` |
| `--procedure` | `-p` | 指定 procedure | 为空则构建全部 |

**构建流程取决于 `variant`：**

- **`bundle`（默认推荐）**：在 `source.path` 执行 `npm install` -> 通过 esbuild Go API 将入口文件 bundle 为单个 `bundle.js` -> 打包为 zip
- **`full`**：在 `source.path` 执行 `npm install` -> 将整个项目目录（含 `node_modules`）打包为 zip

构建前会自动检查当前机器的 OS、Arch、Compiler 是否匹配配置，不匹配则跳过。

**示例：**

```bash
# 构建所有 procedures
dynamic-node build

# 指定配置文件和 procedure
dynamic-node build -c ./my-config.yaml -p my-app
```

### 4.2 push

将本地仓库中的 `.zip` 产物上传到 S3。

```bash
dynamic-node push [-c <config>] [-p <procedure>]
```

| 参数 | 缩写 | 说明 | 默认值 |
|------|------|------|--------|
| `--config` | `-c` | 配置文件路径 | `./dynamic-node-cli.yaml` 或 `.yml` |
| `--procedure` | `-p` | 指定 procedure | 为空则推送全部 |

遍历 warehouse 本地目录，将匹配的 `.zip` 文件（含时间戳备份）上传至配置的所有 remote。远程路径与本地仓库路径保持一致。

**示例：**

```bash
# 推送所有 procedures 的产物
dynamic-node push

# 只推送 my-app
dynamic-node push -p my-app
```

### 4.3 pull

从 S3 仓库拉取产物到本地。

```bash
dynamic-node pull [-c <config>] [-p <procedure>] [-j <concurrency>] [-f] [--remote <remote>]
```

| 参数 | 缩写 | 说明 | 默认值 |
|------|------|------|--------|
| `--config` | `-c` | 配置文件路径 | `./dynamic-node-cli.yaml` 或 `.yml` |
| `--procedure` | `-p` | 指定 procedure | 为空则拉取全部 |
| `--concurrency` | `-j` | 最大并发下载数 | `8` |
| `--force` | `-f` | 强制覆盖本地已有文件 | `false` |
| `--remote` | | 指定单个 remote（覆盖配置） | 使用配置中的所有 remote |

**示例：**

```bash
# 拉取所有产物
dynamic-node pull

# 指定并发数，强制覆盖
dynamic-node pull -p my-app -j 16 -f

# 从指定 remote 拉取
dynamic-node pull --remote s3://backup-bucket/prefix
```

### 4.4 clean

清理仓库产物。clean 命令包含 4 个子命令：

```bash
dynamic-node clean <subcommand> [-c <config>] [-p <procedure>]
```

#### clean all

删除 warehouse 目录下的所有内容。

```bash
dynamic-node clean all
dynamic-node clean all -c ./my-config.yaml -p my-app
```

#### clean cache

删除非 `.zip` 文件，保留 `.zip` 产物及其备份。

```bash
dynamic-node clean cache
dynamic-node clean cache -p my-app
```

#### clean package

删除所有 `.zip` 文件及其带日期的备份。

```bash
dynamic-node clean package
dynamic-node clean package -p my-app
```

#### clean useless

删除所有非 `.zip` 文件（仅保留不带日期后缀的 `.zip`）。

```bash
dynamic-node clean useless
dynamic-node clean useless -p my-app
```

### 4.5 toolchain

工具链检测与描述。

#### toolchain check

检查当前机器的 OS / Arch / Compiler 是否匹配配置中的值。任一不匹配则退出码为 1。

```bash
dynamic-node toolchain check -c <config> -p <procedure>
```

`-p` 参数是**必须的**，因为需要知道检查哪个 procedure 对应的环境。

**示例：**

```bash
dynamic-node toolchain check -p my-app
```

输出示例：

```
pass: OS match (target=ubuntu22.04 actual=ubuntu22.04)
pass: ARCH match (target=amd64v1 actual=amd64v1)
pass: COMPILER match (target=node22 actual=node22)
```

#### toolchain describe

输出当前机器的 toolchain 信息。

```bash
dynamic-node toolchain describe [os|arch|compiler|all]
```

**示例：**

```bash
# 查看全部信息
dynamic-node toolchain describe all
# OS: darwin15.7.3
# Arch: amd64v1
# Compiler: node22.11.0

# 查看单个字段
dynamic-node toolchain describe os
# darwin15.7.3

dynamic-node toolchain describe compiler
# node22.11.0
```

### 4.6 version

输出 CLI 版本号、Go 版本和系统信息。

```bash
dynamic-node version
```

输出示例：

```
Version: dev
Go:      go1.21.0 linux/amd64
```

版本号可在编译时通过 ldflags 注入：

```bash
go build -ldflags "-X github.com/aura-studio/dynamic-node-cli/cmd.Version=v1.0.0" -o dynamic-node .
```

## 5. 典型工作流

### 5.1 构建并推送

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

### 5.2 在部署机器上拉取

```bash
# 拉取产物到本地仓库
dynamic-node pull -p my-app

# 强制重新拉取
dynamic-node pull -p my-app -f
```

### 5.3 清理

```bash
# 清理中间文件，保留 zip 产物
dynamic-node clean cache

# 全部清理
dynamic-node clean all
```

## 6. Compiler 匹配规则

`toolchain.compiler` 字段支持两种匹配粒度：

| 配置值 | 匹配方式 | 示例 |
|--------|---------|------|
| `node22` | 仅检查 Node.js 大版本是否为 22 | 本地 v22.0.0 ~ v22.x.x 均通过 |
| `node22.11.0` | 精确匹配完整版本号 | 仅本地 v22.11.0 通过 |

Node.js 在同一大版本内遵循 SemVer 且 ABI 稳定（N-API 跨版本兼容），大版本匹配已覆盖绝大多数场景。

## 7. 构建方式对比

| | `variant: bundle` | `variant: full` |
|---|---|---|
| 流程 | npm install -> esbuild bundle -> zip | npm install -> 整个目录 zip |
| 产物体积 | 小（通常 < 5 MB） | 大（几十 ~ 几百 MB） |
| 加载速度 | 快（单文件 require） | 中等（解压 + 目录扫描） |
| 兼容性 | 好（90%+ 项目） | 最好（native addon 可用） |
| 适用场景 | 纯 JS/TS 项目 | 含 native addon 的项目 |

默认推荐使用 `bundle`。如果项目使用了 native addon（如 `better-sqlite3`）、依赖 `__dirname`/`__filename`、或使用动态 `require` 路径，应切换到 `full`。
