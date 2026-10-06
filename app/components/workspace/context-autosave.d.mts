import type { ContextDocument } from "./context-sections";

export function mergeContextSave(
  current: ContextDocument,
  submitted: ContextDocument,
  response: ContextDocument,
): {
  document: ContextDocument;
  originalDocument: ContextDocument;
  needsSave: boolean;
};
