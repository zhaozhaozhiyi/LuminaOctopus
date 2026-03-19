declare module 'archiver' {
  interface ArchiverOptions {
    zlib?: { level?: number };
  }
  interface Archiver {
    append(data: Buffer | string, opts: { name: string }): void;
    finalize(): void;
    on(event: 'data', cb: (chunk: Buffer) => void): Archiver;
    on(event: 'end', cb: () => void): Archiver;
    on(event: 'error', cb: (err: Error) => void): Archiver;
  }
  function archiver(format: string, options?: ArchiverOptions): Archiver;
  export = archiver;
}
