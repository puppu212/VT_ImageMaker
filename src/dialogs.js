export function askConfirmation(ui, { title, message, acceptLabel }) {
  ui.confirm_title.textContent = title;
  ui.confirm_message.textContent = message;
  ui.confirm_accept.textContent = acceptLabel;
  ui.confirm_dialog.showModal();

  return new Promise(resolve => {
    const finish = value => {
      ui.confirm_dialog.close();
      resolve(value);
    };
    ui.confirm_accept.onclick = () => finish(true);
    ui.confirm_cancel.onclick = () => finish(false);
    ui.confirm_dialog.oncancel = event => {
      event.preventDefault();
      finish(false);
    };
  });
}

export function askRestoreAction(ui, record) {
  ui.restore_summary.textContent =
    `${formatDateTime(record.savedAt)}に保存された、素材${record.assets.length}件の作業データがあります。`;
  ui.restore_dialog.showModal();

  return new Promise(resolve => {
    ui.restore_workspace.onclick = () => {
      ui.restore_dialog.close();
      resolve("restore");
    };
    ui.discard_workspace.onclick = () => {
      ui.restore_dialog.close();
      resolve("discard");
    };
    ui.restore_dialog.oncancel = event => event.preventDefault();
  });
}

function formatDateTime(timestamp) {
  if (!Number.isFinite(timestamp)) return "日時不明";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}
