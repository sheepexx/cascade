import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const desktop = vi.hoisted(() => ({ value: false }));
const stored = vi.hoisted(() => ({ handle: null as unknown }));
const invoke = vi.hoisted(() => vi.fn());

vi.mock("./pwa", () => ({ isDesktopApp: () => desktop.value }));
vi.mock("./persistence", () => ({
  loadExportFolderHandle: async () => stored.handle,
  saveExportFolderHandle: async (handle: unknown) => {
    stored.handle = handle;
  },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
  exportFolderInfo,
  freeName,
  onExportSaved,
  resetExportDestinationForTests,
  resetExportFolder,
  saveExport,
  type ExportSaved,
} from "./exportDestination";

type Permission = "granted" | "prompt" | "denied";

function fakeFolder(
  name: string,
  {
    existing = [] as string[],
    permission = "granted" as Permission,
    afterRequest = "granted" as Permission,
    broken = false,
  } = {},
) {
  const files = new Map<string, Blob>(existing.map((n) => [n, new Blob(["old"])]));
  const handle = {
    name,
    files,
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => afterRequest),
    getFileHandle: vi.fn(async (file: string, options?: { create?: boolean }) => {
      if (broken && options?.create) throw new DOMException("gone", "NotFoundError");
      if (!files.has(file) && !options?.create) {
        throw new DOMException("missing", "NotFoundError");
      }
      return {
        createWritable: async () => {
          const parts: Blob[] = [];
          return {
            write: async (blob: Blob) => {
              parts.push(blob);
            },
            close: async () => {
              files.set(file, new Blob(parts));
            },
          };
        },
      };
    }),
  };
  return handle;
}

let downloads: string[];
let announced: ExportSaved[];

beforeEach(() => {
  resetExportDestinationForTests();
  desktop.value = false;
  stored.handle = null;
  invoke.mockReset();
  downloads = [];
  announced = [];
  onExportSaved((saved) => announced.push(saved));
  vi.stubGlobal("window", { showDirectoryPicker: vi.fn() });
  vi.stubGlobal("document", {
    body: { appendChild: () => {} },
    createElement: () => ({
      href: "",
      download: "",
      click() {
        downloads.push(this.download);
      },
      remove: () => {},
    }),
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const file = () => new Blob(["map"]);

describe("saving an export in a browser", () => {
  it("downloads it and says so when no folder is chosen", async () => {
    const saved = await saveExport(file(), "Map.osz");

    expect(downloads).toEqual(["Map.osz"]);
    expect(saved).toEqual({ fileName: "Map.osz", location: { kind: "browser" }, fellBack: false });
    expect(announced).toEqual([saved]);
  });

  it("always downloads in a browser that cannot write to folders", async () => {
    vi.stubGlobal("window", {});
    stored.handle = fakeFolder("Maps");

    await saveExport(file(), "Map.osz");

    expect(downloads).toEqual(["Map.osz"]);
    expect(await exportFolderInfo()).toEqual({ supported: false, chosen: false, label: null });
  });

  it("writes into the chosen folder and numbers a name already there", async () => {
    const folder = fakeFolder("Maps", { existing: ["Map.osz"] });
    stored.handle = folder;

    const saved = await saveExport(file(), "Map.osz");

    expect(downloads).toEqual([]);
    expect(saved).toEqual({
      fileName: "Map (1).osz",
      location: { kind: "folder", folder: "Maps" },
      fellBack: false,
    });
    expect(await folder.files.get("Map (1).osz")?.text()).toBe("map");
    expect(await folder.files.get("Map.osz")?.text()).toBe("old");
  });

  it("asks again for permission, and downloads instead when refused", async () => {
    const folder = fakeFolder("Maps", { permission: "prompt", afterRequest: "denied" });
    stored.handle = folder;

    const saved = await saveExport(file(), "Map.osz");

    expect(folder.requestPermission).toHaveBeenCalled();
    expect(downloads).toEqual(["Map.osz"]);
    expect(saved.fellBack).toBe(true);
    expect(saved.location).toEqual({ kind: "browser" });
  });

  it("downloads instead when the folder cannot be written", async () => {
    stored.handle = fakeFolder("Maps", { broken: true });

    const saved = await saveExport(file(), "Map.osz");

    expect(downloads).toEqual(["Map.osz"]);
    expect(saved.fellBack).toBe(true);
  });

  it("forgets the folder when reset", async () => {
    stored.handle = fakeFolder("Maps");
    expect(await exportFolderInfo()).toEqual({ supported: true, chosen: true, label: "Maps" });

    await resetExportFolder();

    expect(stored.handle).toBeNull();
    expect(await exportFolderInfo()).toEqual({ supported: true, chosen: false, label: null });
  });

  it("counts a folder of the same name as taken", async () => {
    const dir = {
      getFileHandle: vi.fn(async (name: string) => {
        if (name === "Map.osz") throw new DOMException("folder", "TypeMismatchError");
        throw new DOMException("missing", "NotFoundError");
      }),
    } as unknown as FileSystemDirectoryHandle;

    expect(await freeName(dir, "Map.osz")).toBe("Map (1).osz");
  });
});

describe("saving an export on desktop", () => {
  it("writes through the app and reports the full path", async () => {
    desktop.value = true;
    invoke.mockResolvedValue({
      path: "C:\\Users\\me\\Downloads\\A - B (1).osz",
      folder: "C:\\Users\\me\\Downloads",
      fellBack: false,
    });

    const saved = await saveExport(file(), "A - B.osz");

    const [command, body, options] = invoke.mock.calls[0];
    expect(command).toBe("export_write");
    expect(body).toBeInstanceOf(Uint8Array);
    expect(options).toEqual({ headers: { "x-cascade-name": "A%20-%20B.osz" } });
    expect(downloads).toEqual([]);
    expect(saved).toEqual({
      fileName: "A - B (1).osz",
      location: {
        kind: "path",
        folder: "C:\\Users\\me\\Downloads",
        path: "C:\\Users\\me\\Downloads\\A - B (1).osz",
      },
      fellBack: false,
    });
  });

  it("passes on that the chosen folder was missing", async () => {
    desktop.value = true;
    invoke.mockResolvedValue({ path: "D:\\x\\Map.osz", folder: "D:\\x", fellBack: true });

    const saved = await saveExport(file(), "Map.osz");

    expect(saved.fellBack).toBe(true);
  });
});
