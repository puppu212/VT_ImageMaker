import {
  detectInstallMode,
  installInstructions,
} from "./pwa-install.js?v=20260612-12";

let installPrompt = null;
let refreshing = false;

setupInstallUi();
const registration = await registerServiceWorker();
if (registration) setupUpdateUi(registration);

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  } catch (error) {
    console.warn("Service Worker registration failed", error);
    return null;
  }
}

function setupInstallUi() {
  const button = document.getElementById("install-app");
  const dialog = document.getElementById("install-dialog");
  const message = document.getElementById("install-instructions");
  if (!button || !dialog || !message) return;

  const standalone = window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const updateButton = () => {
    const mode = detectInstallMode({
      hasPrompt: Boolean(installPrompt),
      standalone,
      userAgent: window.navigator.userAgent,
      maxTouchPoints: window.navigator.maxTouchPoints,
    });
    button.hidden = mode === "installed" || mode === "unsupported";
    button.dataset.installMode = mode;
  };

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    updateButton();
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    button.hidden = true;
  });

  button.addEventListener("click", async () => {
    const mode = button.dataset.installMode;
    if (mode === "prompt" && installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      button.hidden = choice.outcome === "accepted";
      if (choice.outcome !== "accepted") updateButton();
      return;
    }

    message.textContent = installInstructions(mode);
    dialog.showModal();
  });

  updateButton();
}

function setupUpdateUi(registration) {
  const button = document.getElementById("update-app");
  if (!button) return;

  const showUpdate = worker => {
    button.hidden = false;
    button.onclick = () => {
      button.disabled = true;
      worker.postMessage({ type: "SKIP_WAITING" });
    };
  };

  if (registration.waiting) showUpdate(registration.waiting);

  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        showUpdate(worker);
      }
    });
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}
