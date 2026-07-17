# Building src/lib/msd/minacalc.wasm

The MSD badge in the difficulty sidebar is powered by Etterna's MinaCalc
difficulty calculator (calc version 515), compiled to WebAssembly. The
committed artifact is `src/lib/msd/minacalc.wasm`; this folder holds the
inputs needed to rebuild it.

## Sources

- MinaCalc C++ sources: vendored copy inside
  [Glubus/minacalc-rs](https://github.com/Glubus/minacalc-rs) at commit
  `9e8834f8aefef68129d6e6a0f478c9bf09435993`
  (`crates/minacalc-sys/c_code`), which tracks Etterna's calc (MIT).
  Etterna's copyright and MIT license notice are preserved in
  [`LICENSE.etterna`](./LICENSE.etterna).
- `wrapper.cpp` (this folder): flat C ABI over `MinaSDCalc` so the JS
  side can pass plain arrays instead of structs. MSD mode (uncapped),
  score goal 0.93, rate 1.0 by default.
- `shim/xmmintrin.h` (this folder): portable replacement for the four
  SSE intrinsics MinaCalc's `fastsqrt` uses. Upstream already swaps in
  sse2neon on ARM, so an exact `1/sqrtf` here matches the calc's intent;
  values may differ from x86 in the last decimal place, as they already
  do between Intel and AMD.

## Toolchain

Zig (used purely as a portable clang + wasm-ld + wasi-libc/libc++):
https://ziglang.org/download/ - built with zig 0.16.0, x86_64-windows.
No install needed, just extract the archive.

## Build

From a folder containing `wrapper.cpp`, `shim/`, and the cloned
minacalc-rs repo:

```sh
zig c++ -target wasm32-wasi -std=c++20 -O3 -fno-exceptions -w \
  -DSTANDALONE_CALC -mexec-model=reactor -Wl,--strip-all \
  -I shim -I minacalc-rs/crates/minacalc-sys/c_code \
  -Wl,--export=msd_version -Wl,--export=msd_create \
  -Wl,--export=msd_destroy -Wl,--export=msd_compute \
  -Wl,--export=malloc -Wl,--export=free \
  minacalc-rs/crates/minacalc-sys/c_code/MinaCalc/MinaCalc.cpp \
  wrapper.cpp -o minacalc.wasm
```

Copy the output to `src/lib/msd/minacalc.wasm`. The vitest suite
(`src/lib/msd/msd.test.ts`) asserts the calc version and sanity-checks
ratings, so a bad rebuild fails CI-side checks immediately.

## Runtime

The wasm is a WASI reactor module; `src/lib/msd/wasi.ts` provides the
handful of `wasi_snapshot_preview1` stubs it imports (fd_write,
proc_exit, environ/clock/random). It runs inside a web worker
(`src/lib/msd/msdWorker.ts`) so live recalculation never blocks the UI.
MinaCalc rates 4K, 6K, and 7K charts; other keymodes show no MSD badge.
