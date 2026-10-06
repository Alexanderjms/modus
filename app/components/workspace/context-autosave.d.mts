import type { ContextDocument } from "./context-document.mjs";

export function mergeContextSave(
  current: ContextDocument,
  submitted: ContextDocument,
  response: ContextDocument,
): {
  document: ContextDocument;
  originalDocument: ContextDocument;
  needsSave: boolean;
};
