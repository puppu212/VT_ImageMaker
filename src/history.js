export class History {
  constructor(limit = 30) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  record(snapshot) {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo(currentSnapshot) {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return null;
    this.redoStack.push(currentSnapshot);
    return snapshot;
  }

  redo(currentSnapshot) {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return null;
    this.undoStack.push(currentSnapshot);
    return snapshot;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }
}
