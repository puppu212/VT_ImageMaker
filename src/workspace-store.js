const DB_NAME = "vt-imagemaker";
const DB_VERSION = 1;
const STORE_NAME = "workspace";
const RECORD_KEY = "current";
let databasePromise = null;

export function createWorkspaceRecord(state, settings) {
  return {
    version: 1,
    savedAt: Date.now(),
    assets: [...state.assets.values()].map(asset => ({
      name: asset.name,
      width: asset.width,
      height: asset.height,
      pixels: new Uint8ClampedArray(asset.pixels),
      sourceType: asset.sourceType ?? "画像",
    })),
    selectedName: state.selectedName,
    view: state.view,
    zoom: state.zoom,
    settings: {
      atlasWidth: settings.atlasWidth,
      opaqueOutput: settings.opaqueOutput,
      outputTarget: settings.outputTarget,
    },
  };
}

export function restoreWorkspaceRecord(record) {
  if (!record || record.version !== 1 || !Array.isArray(record.assets)) {
    throw new Error("保存データの形式に対応していません");
  }
  const assets = new Map(record.assets.map(asset => [
    asset.name,
    { ...asset, pixels: new Uint8ClampedArray(asset.pixels) },
  ]));
  return {
    assets,
    selectedName: assets.has(record.selectedName) ? record.selectedName : null,
    view: record.view === "asset" ? "asset" : "atlas",
    zoom: Number.isFinite(record.zoom) ? record.zoom : 2,
    settings: {
      atlasWidth: record.settings?.atlasWidth === "2048" ? "2048" : "1024",
      opaqueOutput: Boolean(record.settings?.opaqueOutput),
      outputTarget: record.settings?.outputTarget === "2" ? "2" : "1",
    },
    savedAt: record.savedAt,
  };
}

export async function loadWorkspace() {
  const db = await openDatabase();
  return requestToPromise(
    db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(RECORD_KEY)
  );
}

export async function saveWorkspace(record) {
  const db = await openDatabase();
  await transactionToPromise(
    db.transaction(STORE_NAME, "readwrite"),
    transaction => transaction.objectStore(STORE_NAME).put(record, RECORD_KEY)
  );
}

export async function deleteWorkspace() {
  const db = await openDatabase();
  await transactionToPromise(
    db.transaction(STORE_NAME, "readwrite"),
    transaction => transaction.objectStore(STORE_NAME).delete(RECORD_KEY)
  );
}

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error("このブラウザは自動保存に対応していません"));
  }
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error);
    };
  });
  return databasePromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionToPromise(transaction, operation) {
  return new Promise((resolve, reject) => {
    operation(transaction);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
