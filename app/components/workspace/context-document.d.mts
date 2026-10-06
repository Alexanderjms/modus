export type ContextResource = { title: string; url: string };

export type ContextDocument = {
  context: string;
  rules: string[];
  resources: ContextResource[];
};

export function isContextFile(resource: ContextResource): boolean;

export function isValidContextDocument(document: ContextDocument): boolean;

export function isContextDocument(value: unknown): value is ContextDocument;
