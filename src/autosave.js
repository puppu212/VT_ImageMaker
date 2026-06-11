import {
  createWorkspaceRecord,
  deleteWorkspace,
  loadWorkspace,
  saveWorkspace,
} from "./workspace-store.js?v=20260611-11";

export class Autosave {
  constructor({ state, getSettings, onStatus, delay = 350 }) {
    this.state = state;
    this.getSettings = getSettings;
    this.onStatus = onStatus;
    this.delay = delay;
    this.timer = null;
    this.enabled = true;
  }

  load() {
    return loadWorkspace();
  }

  schedule() {
    if (!this.enabled || !this.state.assets.size) return;
    this.cancelPending();
    this.onStatus("保存中…");
    this.timer = globalThis.setTimeout(() => this.save(), this.delay);
  }

  async save() {
    try {
      await saveWorkspace(createWorkspaceRecord(this.state, this.getSettings()));
      this.onStatus(`自動保存済み ${formatTime(Date.now())}`);
    } catch (error) {
      this.handleError(error);
    }
  }

  async clear() {
    this.cancelPending();
    try {
      await deleteWorkspace();
      this.onStatus("保存データなし");
    } catch (error) {
      this.handleError(error);
    }
  }

  persistCurrent() {
    if (this.state.assets.size) this.schedule();
    else void this.clear();
  }

  disable(error) {
    this.enabled = false;
    this.cancelPending();
    this.handleError(error);
  }

  cancelPending() {
    globalThis.clearTimeout(this.timer);
    this.timer = null;
  }

  handleError(error) {
    const quota = error?.name === "QuotaExceededError";
    this.onStatus(
      quota ? "保存容量が不足しています" : "自動保存できません",
      true
    );
    console.warn("Workspace persistence failed", error);
  }
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}
