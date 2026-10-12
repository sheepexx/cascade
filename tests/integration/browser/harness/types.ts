import type { ManiaNote } from "../../../../src/types";

/** What specs and the harness page pass across page.evaluate. */
export type ManiaNoteLike = ManiaNote;

/** Any op, well formed or not, for a test that sends one a client wouldn't. */
export type CollabOp = Record<string, unknown>;

export type HarnessState = {
  ready: boolean;
  status: string;
  role: string | null;
  canEdit: boolean;
  title: string;
  notes: Record<string, ManiaNote[]>;
  activeId: string;
  cloudError: string | null;
  notice: string | null;
  peerNotice: string | null;
  revision: number | null;
  unsaved: boolean;
  recoveryUnsaved: boolean;
  backups: { reason: string; title: string; notes: Record<string, ManiaNote[]> }[];
  saveStatus: string | null;
};

export type HarnessApi = {
  state(): HarnessState;
  addNote(note: ManiaNoteLike): void;
  moveNote(id: string, changes: Partial<ManiaNoteLike>): void;
  removeNote(id: string): void;
  setTitle(title: string): void;
  undo(): void;
  redo(): void;
  save(): Promise<void>;
  sendRawOp(op: CollabOp): void;
};

declare global {
  interface Window {
    harness?: HarnessApi;
  }
}
