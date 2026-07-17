export class WasiExitError extends Error {
  code: number;
  constructor(code: number) {
    super(`wasi proc_exit(${code})`);
    this.name = "WasiExitError";
    this.code = code;
  }
}

export function makeWasiStubs(
  getMemory: () => WebAssembly.Memory,
): Record<string, (...args: number[]) => number> {
  const view = () => new DataView(getMemory().buffer);
  return {
    proc_exit: (code: number): never => {
      throw new WasiExitError(code);
    },
    fd_write: (_fd, iovsPtr, iovsLen, nwrittenPtr) => {
      const dv = view();
      let written = 0;
      for (let i = 0; i < iovsLen; i++) {
        written += dv.getUint32(iovsPtr + i * 8 + 4, true);
      }
      dv.setUint32(nwrittenPtr, written, true);
      return 0;
    },
    fd_read: () => 8,
    fd_close: () => 0,
    fd_seek: () => 8,
    fd_fdstat_get: () => 8,
    fd_fdstat_set_flags: () => 8,
    fd_prestat_get: () => 8,
    fd_prestat_dir_name: () => 8,
    path_open: () => 8,
    environ_sizes_get: (countPtr, bufSizePtr) => {
      const dv = view();
      dv.setUint32(countPtr, 0, true);
      dv.setUint32(bufSizePtr, 0, true);
      return 0;
    },
    environ_get: () => 0,
    args_sizes_get: (countPtr, bufSizePtr) => {
      const dv = view();
      dv.setUint32(countPtr, 0, true);
      dv.setUint32(bufSizePtr, 0, true);
      return 0;
    },
    args_get: () => 0,
    clock_time_get: (_id, _precision, outPtr) => {
      view().setBigUint64(outPtr, BigInt(Date.now()) * 1000000n, true);
      return 0;
    },
    random_get: (ptr, len) => {
      const bytes = new Uint8Array(getMemory().buffer, ptr, len);
      for (let i = 0; i < len; i++) bytes[i] = (Math.random() * 256) | 0;
      return 0;
    },
    sched_yield: () => 0,
  };
}
