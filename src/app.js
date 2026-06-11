import {
  detectOutputTarget,
  encodeBmp32,
  extractAssets,
  findConflictingImageFiles,
  findDatFolderFiles,
  packAssets,
  parseBmp32,
  parseImageData,
  serializeImageData,
} from "./formats.js?v=20260611-11";
import { Autosave } from "./autosave.js?v=20260611-11";
import { askConfirmation, askRestoreAction } from "./dialogs.js?v=20260611-11";
import { History } from "./history.js?v=20260611-11";
import {
  decodeImageFile,
  download,
  drawPixels,
  renderTextAsset,
} from "./image-io.js?v=20260611-11";
import {
  decodeShiftJis,
  getTextAssetStyle,
  parseCustomText,
  parseVoiceText,
} from "./text-assets.js?v=20260611-11";
import {
  createWorkspaceRecord,
  restoreWorkspaceRecord,
} from "./workspace-store.js?v=20260611-11";

const state = {
  assets: new Map(),
  selectedName: null,
  view: "atlas",
  atlas: null,
  zoom: 2,
};
const history = new History(30);

const ui = Object.fromEntries([
  "asset-list", "asset-count", "search-assets", "add-images", "add-folder",
  "preview-canvas", "preview-scroller", "preview-zoom", "preview-zoom-value",
  "empty-message", "status", "atlas-size", "asset-details", "replace-image",
  "delete-asset", "atlas-width", "opaque-output", "clear-assets", "open-dat",
  "open-png", "export-data", "dat-dialog", "png-dialog", "export-dialog", "confirm-export",
  "image-dat-file", "image-data-file", "load-dat-pair", "output-target",
  "custom-text-file", "voice-text-file", "dat-folder", "save-status",
  "restore-dialog", "restore-summary", "restore-workspace", "discard-workspace",
  "confirm-dialog", "confirm-title", "confirm-message", "confirm-cancel", "confirm-accept",
  "undo-action", "redo-action",
].map(id => [id.replaceAll("-", "_"), document.getElementById(id)]));

const previewContext = ui.preview_canvas.getContext("2d");
previewContext.imageSmoothingEnabled = false;
const autosave = new Autosave({
  state,
  getSettings,
  onStatus: setSaveStatus,
});

bindEvents();
await restoreSavedWorkspace();
renderAll();

function bindEvents() {
  document.querySelector(".view-tabs").addEventListener("click", event => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    state.view = button.dataset.view;
    document.querySelectorAll(".view-tab").forEach(tab =>
      tab.classList.toggle("active", tab === button)
    );
    renderPreview();
    autosave.schedule();
  });

  ui.add_images.addEventListener("change", importImages);
  ui.add_folder.addEventListener("change", importImages);
  ui.replace_image.addEventListener("change", replaceSelected);
  ui.search_assets.addEventListener("input", renderAssetList);
  ui.delete_asset.addEventListener("click", deleteSelected);
  ui.clear_assets.addEventListener("click", clearAssets);
  ui.open_dat.addEventListener("click", () => ui.dat_dialog.showModal());
  ui.open_png.addEventListener("click", () => ui.png_dialog.showModal());
  ui.dat_folder.addEventListener("change", loadDatFolder);
  ui.load_dat_pair.addEventListener("click", loadDatPair);
  ui.export_data.addEventListener("click", () => ui.export_dialog.showModal());
  ui.confirm_export.addEventListener("click", exportData);
  ui.undo_action.addEventListener("click", undo);
  ui.redo_action.addEventListener("click", redo);
  document.addEventListener("keydown", handleHistoryShortcut);
  ui.atlas_width.addEventListener("change", () => {
    invalidateAtlas();
    autosave.schedule();
  });
  ui.opaque_output.addEventListener("change", () => {
    invalidateAtlas();
    autosave.schedule();
  });
  ui.output_target.addEventListener("change", () => autosave.schedule());
  ui.preview_zoom.addEventListener("input", () => {
    state.zoom = Number(ui.preview_zoom.value) / 100;
    ui.preview_zoom_value.value = `${ui.preview_zoom.value}%`;
    applyCanvasScale();
    autosave.schedule();
  });
}

async function importImages(event) {
  let files = [...(event.target.files ?? [])]
    .filter(file => /\.(png|bmp)$/i.test(file.name));
  if (!files.length) return;
  const conflicts = findConflictingImageFiles(files, state.assets.keys());
  let skipped = 0;
  if (conflicts.length) {
    const overwrite = await askConfirmation(ui, {
      title: "同名の素材があります",
      message: `${conflicts.length}件の素材を上書きしますか？ 上書きしない場合、同名素材だけを除外して追加します。`,
      acceptLabel: "上書きする",
    });
    if (!overwrite) {
      const conflictNames = new Set(conflicts.map(file => filenameStem(file.name)));
      files = files.filter(file => !conflictNames.has(filenameStem(file.name)));
      skipped = conflicts.length;
    }
  }
  const decodedAssets = [];
  for (const file of files) {
    try {
      const asset = await decodeImageFile(file);
      asset.name = filenameStem(file.name);
      asset.sourceType = /\.bmp$/i.test(file.name) ? "BMP" : "PNG";
      decodedAssets.push(asset);
    } catch (error) {
      console.warn(file.name, error);
    }
  }
  if (!decodedAssets.length) {
    setStatus("読み込める画像がありませんでした", true);
    event.target.value = "";
    return;
  }
  recordHistory();
  for (const asset of decodedAssets) {
    state.assets.set(asset.name, asset);
    state.selectedName = asset.name;
  }
  invalidateAtlas();
  renderAll();
  ui.png_dialog.close();
  const skippedMessage = skipped ? `（同名${skipped}件は追加しませんでした）` : "";
  setStatus(`${decodedAssets.length}件の素材を読み込みました${skippedMessage}`);
  autosave.schedule();
  event.target.value = "";
}

async function replaceSelected(event) {
  const [file] = [...(event.target.files ?? [])];
  if (!file || !state.selectedName) return;
  try {
    const asset = await decodeImageFile(file);
    asset.name = state.selectedName;
    asset.sourceType = /\.bmp$/i.test(file.name) ? "BMP" : "PNG";
    recordHistory();
    state.assets.set(asset.name, asset);
    invalidateAtlas();
    renderAll();
    setStatus(`${asset.name}を置き換えました`);
    autosave.schedule();
  } catch (error) {
    setStatus(`置換に失敗しました: ${error.message}`, true);
  }
  event.target.value = "";
}

async function loadDatPair() {
  const imageFile = ui.image_dat_file.files?.[0];
  const dataFile = ui.image_data_file.files?.[0];
  if (!imageFile || !dataFile) {
    setStatus("image.datとimagedata.datの両方を選択してください", true);
    return;
  }
  await loadDatFiles({
    imageFile,
    dataFile,
    customFile: ui.custom_text_file.files?.[0] ?? null,
    voiceFile: ui.voice_text_file.files?.[0] ?? null,
  });
}

async function loadDatFolder(event) {
  try {
    await loadDatFiles(findDatFolderFiles(event.target.files ?? []));
  } catch (error) {
    setStatus(`DAT読込エラー: ${error.message}`, true);
  } finally {
    event.target.value = "";
  }
}

async function loadDatFiles({ imageFile, dataFile, customFile, voiceFile }) {
  if (state.assets.size) {
    const proceed = await askConfirmation(ui, {
      title: "現在の作業を置き換えます",
      message: `読み込み中の${state.assets.size}件の素材を閉じ、選択したDATファイルの内容へ置き換えます。続けますか？`,
      acceptLabel: "置き換える",
    });
    if (!proceed) return;
  }
  try {
    const [imageBytes, dataBytes] = await Promise.all([
      imageFile.arrayBuffer(),
      dataFile.arrayBuffer(),
    ]);
    const atlas = parseBmp32(imageBytes);
    const metadata = parseImageData(dataBytes);
    if (atlas.width !== metadata.width || atlas.height !== metadata.height) {
      throw new Error("画像DATと座標DATのサイズが一致しません");
    }
    recordHistory();
    state.assets = new Map(
      extractAssets(atlas, metadata).map(asset => [
        asset.name,
        { ...asset, sourceType: "DAT" },
      ])
    );
    const repaired = await repairTextAssets(customFile, voiceFile);
    state.selectedName = state.assets.keys().next().value ?? null;
    state.atlas = repaired
      ? null
      : {
          ...atlas,
          entries: metadata.entries,
          transparentColor: metadata.transparentColor,
        };
    ui.atlas_width.value = String(atlas.width);
    ui.output_target.value = detectOutputTarget(imageFile.name, dataFile.name);
    ui.dat_dialog.close();
    renderAll();
    ui.custom_text_file.value = "";
    ui.voice_text_file.value = "";
    ui.image_dat_file.value = "";
    ui.image_data_file.value = "";
    const repairMessage = repaired ? `、文字素材${repaired}件を再生成しました` : "";
    setStatus(`${state.assets.size}件の素材をDATから読み込みました${repairMessage}`);
    autosave.schedule();
  } catch (error) {
    setStatus(`DAT読込エラー: ${error.message}`, true);
  }
}

async function repairTextAssets(customFile, voiceFile) {
  let repaired = 0;

  if (customFile) {
    const custom = parseCustomText(decodeShiftJis(await customFile.arrayBuffer()));
    for (const [name, text] of custom) {
      state.assets.set(name, {
        name,
        ...renderTextAsset(text, getTextAssetStyle(name)),
        sourceType: "custom.txt",
      });
      repaired++;
    }
  }

  if (voiceFile) {
    const voices = parseVoiceText(decodeShiftJis(await voiceFile.arrayBuffer()));
    for (const [group, texts] of Object.entries(voices)) {
      texts.forEach((text, index) => {
        const name = group === "male" ? `t_retmsg${index}` : `t_retmsgf${index}`;
        state.assets.set(name, {
          name,
          ...renderTextAsset(text, {
            size: 16,
            weight: 400,
            color: group === "male" ? "#ffffff" : "#ffdcff",
          }),
          sourceType: "voice.txt",
        });
        repaired++;
      });
    }
  }
  return repaired;
}

function rebuildAtlas(render = true) {
  try {
    state.atlas = packAssets(
      [...state.assets.values()],
      Number(ui.atlas_width.value),
      ui.opaque_output.checked
    );
    if (render) renderPreview();
    updateAtlasStatus();
    setStatus("全体表示を更新しました");
    return state.atlas;
  } catch (error) {
    setStatus(`構築エラー: ${error.message}`, true);
    return null;
  }
}

function exportData() {
  const atlas = rebuildAtlas();
  if (!atlas) return;
  if (!state.assets.size) {
    setStatus("書き出す素材がありません", true);
    return;
  }
  if (atlas.height > 2048) {
    setStatus(`高さ${atlas.height}pxのため書き出せません（上限2048px）`, true);
    return;
  }

  const suffix = ui.output_target.value === "2" ? "2" : "";
  download(`image${suffix}.dat`, encodeBmp32(atlas), "application/octet-stream");
  download(
    `imagedata${suffix}.dat`,
    serializeImageData(atlas),
    "application/octet-stream"
  );
  ui.export_dialog.close();
  setStatus(`image${suffix}.dat と imagedata${suffix}.dat を書き出しました`);
}

function renderAll() {
  renderAssetList();
  renderDetails();
  renderPreview();
  updateAtlasStatus();
}

function renderAssetList() {
  const query = ui.search_assets.value.trim().toLowerCase();
  ui.asset_list.textContent = "";
  const assets = [...state.assets.values()]
    .filter(asset => asset.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const asset of assets) {
    const button = document.createElement("button");
    button.className = "asset-card";
    button.classList.toggle("selected", asset.name === state.selectedName);
    button.title = `${asset.name} (${asset.width}×${asset.height})`;
    const canvas = document.createElement("canvas");
    drawPixels(canvas, asset);
    button.append(canvas);
    const label = document.createElement("span");
    label.textContent = asset.name;
    button.append(label);
    button.addEventListener("click", () => {
      state.selectedName = asset.name;
      state.view = "asset";
      document.querySelectorAll(".view-tab").forEach(tab =>
        tab.classList.toggle("active", tab.dataset.view === "asset")
      );
      renderAll();
      autosave.schedule();
    });
    ui.asset_list.append(button);
  }
  ui.asset_count.textContent = `${state.assets.size}件`;
}

function renderDetails() {
  const asset = selectedAsset();
  ui.asset_details.textContent = "";
  ui.asset_details.classList.toggle("empty", !asset);
  ui.delete_asset.disabled = !asset;
  ui.replace_image.disabled = !asset;
  if (!asset) {
    ui.asset_details.textContent = "素材を選択してください";
    return;
  }
  for (const [label, value] of [
    ["名前", asset.name],
    ["サイズ", `${asset.width} × ${asset.height}px`],
    ["読込元", asset.sourceType ?? "画像"],
  ]) {
    const row = document.createElement("div");
    row.className = "detail-row";
    row.innerHTML = `<span>${label}</span><strong></strong>`;
    row.querySelector("strong").textContent = value;
    ui.asset_details.append(row);
  }
}

function renderPreview() {
  let image = null;
  if (state.view === "atlas") {
    image = state.assets.size ? state.atlas ?? rebuildAtlas(false) : null;
  } else {
    image = selectedAsset();
  }
  if (!image) {
    ui.preview_canvas.style.display = "none";
    ui.empty_message.style.display = "block";
    return;
  }
  drawPixels(ui.preview_canvas, image);
  ui.preview_canvas.style.display = "block";
  ui.empty_message.style.display = "none";
  applyCanvasScale();
}

function applyCanvasScale() {
  ui.preview_canvas.style.width = `${ui.preview_canvas.width * state.zoom}px`;
  ui.preview_canvas.style.height = `${ui.preview_canvas.height * state.zoom}px`;
}

function updateAtlasStatus() {
  ui.atlas_size.textContent = state.atlas
    ? `${state.atlas.width} × ${state.atlas.height}px`
    : "出力画像未作成";
}

function deleteSelected() {
  if (!state.selectedName) return;
  const name = state.selectedName;
  recordHistory();
  state.assets.delete(name);
  state.selectedName = state.assets.keys().next().value ?? null;
  invalidateAtlas();
  renderAll();
  setStatus(`${name}を削除しました`);
  autosave.schedule();
}

async function clearAssets() {
  if (!state.assets.size || !window.confirm("すべての素材を消去しますか？")) return;
  recordHistory();
  autosave.cancelPending();
  state.assets.clear();
  state.selectedName = null;
  state.atlas = null;
  renderAll();
  await autosave.clear();
  setStatus("素材と自動保存データを消去しました");
}

function invalidateAtlas() {
  state.atlas = null;
  updateAtlasStatus();
  if (state.view === "atlas") renderPreview();
}

function recordHistory() {
  history.record(captureWorkspace());
  updateHistoryActions();
}

function undo() {
  const snapshot = history.undo(captureWorkspace());
  if (!snapshot) return;
  applyWorkspaceSnapshot(snapshot);
  setStatus("操作を元に戻しました");
}

function redo() {
  const snapshot = history.redo(captureWorkspace());
  if (!snapshot) return;
  applyWorkspaceSnapshot(snapshot);
  setStatus("操作をやり直しました");
}

function captureWorkspace() {
  return createWorkspaceRecord(state, getSettings());
}

function applyWorkspaceSnapshot(snapshot) {
  const restored = restoreWorkspaceRecord(snapshot);
  state.assets = restored.assets;
  state.selectedName = restored.selectedName;
  state.view = restored.view;
  state.zoom = restored.zoom;
  state.atlas = null;
  ui.atlas_width.value = restored.settings.atlasWidth;
  ui.opaque_output.checked = restored.settings.opaqueOutput;
  ui.output_target.value = restored.settings.outputTarget;
  ui.preview_zoom.value = String(Math.round(state.zoom * 100));
  ui.preview_zoom_value.value = `${ui.preview_zoom.value}%`;
  document.querySelectorAll(".view-tab").forEach(tab =>
    tab.classList.toggle("active", tab.dataset.view === state.view)
  );
  renderAll();
  updateHistoryActions();
  autosave.persistCurrent();
}

function updateHistoryActions() {
  ui.undo_action.disabled = !history.canUndo;
  ui.redo_action.disabled = !history.canRedo;
}

function handleHistoryShortcut(event) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
  if (event.target.matches("input, textarea, select") || event.target.isContentEditable) return;
  const key = event.key.toLowerCase();
  if (key === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  } else if (key === "y" && !event.shiftKey) {
    event.preventDefault();
    redo();
  }
}

function selectedAsset() {
  return state.selectedName ? state.assets.get(state.selectedName) ?? null : null;
}

function filenameStem(name) {
  return name.replace(/\.[^.]+$/, "");
}

function setStatus(message, error = false) {
  ui.status.textContent = message;
  ui.status.style.color = error ? "var(--danger)" : "";
}

async function restoreSavedWorkspace() {
  try {
    const record = await autosave.load();
    if (!record?.assets?.length) {
      setSaveStatus("自動保存有効");
      return;
    }
    const action = await askRestoreAction(ui, record);
    if (action === "discard") {
      await autosave.clear();
      return;
    }
    if (action !== "restore") return;
    const restored = restoreWorkspaceRecord(record);
    state.assets = restored.assets;
    state.selectedName = restored.selectedName;
    state.view = restored.view;
    state.zoom = restored.zoom;
    state.atlas = null;
    ui.atlas_width.value = restored.settings.atlasWidth;
    ui.opaque_output.checked = restored.settings.opaqueOutput;
    ui.output_target.value = restored.settings.outputTarget;
    ui.preview_zoom.value = String(Math.round(state.zoom * 100));
    ui.preview_zoom_value.value = `${ui.preview_zoom.value}%`;
    document.querySelectorAll(".view-tab").forEach(tab =>
      tab.classList.toggle("active", tab.dataset.view === state.view)
    );
    setStatus(`${state.assets.size}件の前回作業を復元しました`);
    setSaveStatus("復元済み");
  } catch (error) {
    autosave.disable(error);
  }
}

function getSettings() {
  return {
    atlasWidth: ui.atlas_width.value,
    opaqueOutput: ui.opaque_output.checked,
    outputTarget: ui.output_target.value,
  };
}

function setSaveStatus(message, error = false) {
  ui.save_status.textContent = message;
  ui.save_status.classList.toggle("error", error);
}
