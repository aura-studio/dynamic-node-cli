# dynamic-node-cli meta

`dynamic-node-cli` owns dynamic package metadata at build time, matching the Go
`dynamic-cli` model. Target packages should not provide dynamic package metadata
through their own `meta()` or `Meta()` implementations. The generated wrapper
always exposes build meta.

Every generated artifact contains `dynamic-meta.json`, and `meta read` /
`meta call` return the same Go-aligned schema:

```json
{
  "dynamic": {
    "module": "./examples/sample-app",
    "version": "1.0.0",
    "built": "2026-05-24T11:16:03Z"
  },
  "toolchain": {
    "os": "windows10.0.26200.0",
    "arch": "amd64v1",
    "compiler": "node26.2.0",
    "variant": "bundle"
  }
}
```

`dynamic.version` is resolved from the source module root `package.json`
version. It is not copied from `source.version`, and it is not read from the
package-level Tunnel implementation. If no source module version can be found,
the value is `unknown`.

The examples cover `meta read` and `meta call` across all generated packages:

- sample bundle/full
- service bundle/full
- wire bundle/full
