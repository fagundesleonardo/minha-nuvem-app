// Minimal ambient types for the File System Access API (Chromium only).
// Not yet part of TypeScript's bundled DOM lib, so we declare just the
// surface this app actually uses. See: src/lib/photoSync.ts.

type FsPermissionMode = "read" | "readwrite";
type FsPermissionState = "granted" | "denied" | "prompt";

interface FileSystemHandlePermissions {
  queryPermission?(opts?: { mode?: FsPermissionMode }): Promise<FsPermissionState>;
  requestPermission?(opts?: { mode?: FsPermissionMode }): Promise<FsPermissionState>;
}

interface FileSystemDirectoryHandle extends FileSystemHandlePermissions {
  readonly kind: "directory";
  readonly name: string;
  entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
}

interface FileSystemFileHandle extends FileSystemHandlePermissions {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
}

interface DirectoryPickerOptions {
  id?: string;
  mode?: FsPermissionMode;
  startIn?: string;
}

interface Window {
  showDirectoryPicker?(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
