import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

/** Feature-owned state (Jotai, per repo rules). One atom family instance per
 *  artifact id, held in a plain record — the artifact panel owns which id is
 *  active; everything here is scoped to the id to survive pane host changes. */

export type PendingSuggestion = {
  /** Word-level ranges of the suggestion, in document-order. */
  originalText: string;
  suggestedText: string;
  rangeFrom: number;
  rangeTo: number;
  instruction: string;
  createdAt: number;
};

export type DocumentVersionMeta = {
  id: string;
  title: string;
  createdAt: number;
  source: string;
};

type DocumentState = {
  /** Markdown in the editor (source of truth while open). */
  markdown: string;
  /** Markdown last imported/persisted; difference = unsaved changes. */
  savedMarkdown: string;
  /** Title held by the editor; null = follow the artifact title. */
  savedTitle: string | null;
  versionMeta: DocumentVersionMeta[];
  pending: PendingSuggestion | null;
  conflict: { message: string; document: unknown } | null;
};

const emptyState: DocumentState = {
  markdown: '',
  savedMarkdown: '',
  savedTitle: null,
  versionMeta: [],
  pending: null,
  conflict: null,
};

const documentsAtom = atom<Record<string, DocumentState>>({});

/** Persisted "dirty" marker hints the versions drawer; content itself lives in
 *  Mongo through /api/documents and in the message artifact. */
const dirtyPathsAtom = atomWithStorage<Record<string, boolean>>(
  'endowgpt.document.dirty',
  {},
  undefined,
  { getOnInit: true },
);

const getDocument = (
  all: Record<string, DocumentState>,
  id: string,
): DocumentState => all[id] ?? emptyState;

export const useDocumentState = (artifactId: string) => {
  const [documents, setDocuments] = useAtom(documentsAtom);
  const state = getDocument(documents, artifactId);
  const patch = (partial: Partial<DocumentState>) => {
    setDocuments((prev) => ({
      ...prev,
      [artifactId]: { ...getDocument(prev, artifactId), ...partial },
    }));
  };
  return {
    state,
    patch,
    reset: () =>
      setDocuments((prev) => {
        const next = { ...prev };
        delete next[artifactId];
        return next;
      }),
  };
};

export const useDocumentDirty = (artifactId: string) => {
  const [dirty, setDirty] = useAtom(dirtyPathsAtom);
  return {
    dirty: dirty[artifactId] === true,
    setDirty: (value: boolean) => setDirty((prev) => ({ ...prev, [artifactId]: value })),
  };
};

export const usePendingSuggestion = (artifactId: string) => {
  const { state, patch } = useDocumentState(artifactId);
  const setPending = (pending: PendingSuggestion | null) => patch({ pending });
  return { pending: state.pending, setPending };
};
