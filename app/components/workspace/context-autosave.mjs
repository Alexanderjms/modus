const sameDocument = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function mergeContextSave(current, submitted, response) {
  const hasNewerEdits = !sameDocument(current, submitted);
  return {
    document: hasNewerEdits ? current : response,
    originalDocument: response,
    needsSave: hasNewerEdits,
  };
}
