"use strict";

const { app, BrowserWindow, Menu, dialog, nativeTheme, session, shell, utilityProcess } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const PREFERRED_PORT = 47315;
const STARTUP_TIMEOUT_MS = 45000;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

app.setName("Modus");
if (!app.commandLine.hasSwitch("user-data-dir")) app.setPath("userData", path.join(app.getPath("appData"), "Modus"));

let serverProcess = null;
let mainWindow = null;
let origin = "";

const backgroundColor = () => (nativeTheme.shouldUseDarkColors ? "#121318" : "#f2f2f4");

function serverEntry() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "server", "server.js")
    : path.join(__dirname, "..", ".desktop-stage", ".next", "standalone", "server.js");
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () => {
      const { port: bound } = probe.address();
      probe.close(() => resolve(bound));
    });
  });
}

const findPort = () => listen(PREFERRED_PORT).catch(() => listen(0));

function waitForServer(port) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get({ host: "127.0.0.1", port, path: "/", timeout: 2000 }, (response) => {
        response.resume();
        resolve();
      });
      const retry = () => {
        request.destroy();
        if (Date.now() > deadline) reject(new Error("El servidor local no respondió a tiempo."));
        else setTimeout(attempt, 250);
      };
      request.on("error", retry);
      request.on("timeout", retry);
    };
    attempt();
  });
}

function startServer(port) {
  const entry = serverEntry();
  if (!fs.existsSync(entry)) throw new Error(`No se encontró el servidor de Modus: ${entry}`);
  const dataDir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  serverProcess = utilityProcess.fork(entry, [], {
    serviceName: "modus-server",
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      MODUS_DATA_DIR: dataDir,
      MODUS_DESKTOP: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  serverProcess.once("exit", (code) => {
    serverProcess = null;
    if (app.isQuitting) return;
    dialog.showErrorBox("Modus", `El servidor local se detuvo inesperadamente (código ${code}).`);
    app.quit();
  });
}

const updateMessages = {
  es: { title: "Actualización lista", message: (version) => `Modus ${version} está listo para instalarse.`, detail: "Reinicia para actualizar. Tus datos se conservan.", restart: "Reiniciar ahora", later: "Más tarde" },
  en: { title: "Update ready", message: (version) => `Modus ${version} is ready to install.`, detail: "Restart to update. Your data is kept.", restart: "Restart now", later: "Later" },
};

async function currentLanguage() {
  const [cookie] = await session.defaultSession.cookies.get({ name: "modus-lang" });
  if (cookie?.value === "en" || cookie?.value === "es") return cookie.value;
  return app.getLocale().toLowerCase().startsWith("es") ? "es" : "en";
}

// Solo la versión instalada se actualiza sola: la portable (.zip) no incluye el desinstalador.
function canAutoUpdate() {
  return app.isPackaged && fs.existsSync(path.join(path.dirname(process.execPath), "Uninstall Modus.exe"));
}

function setupAutoUpdate() {
  if (!canAutoUpdate()) return;
  const { autoUpdater } = require("electron-updater");
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("error", (error) => console.error("[updater]", error?.message ?? error));
  autoUpdater.on("update-downloaded", async (info) => {
    const text = updateMessages[await currentLanguage()];
    const { response } = await dialog.showMessageBox(mainWindow ?? undefined, {
      type: "info",
      title: text.title,
      message: text.message(info.version),
      detail: text.detail,
      buttons: [text.restart, text.later],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      app.isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  });
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, UPDATE_CHECK_INTERVAL_MS).unref();
}

function isInternal(url) {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: backgroundColor(),
    title: "Modus",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("page-title-updated", (event) => event.preventDefault());
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) return { action: "allow" };
    openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isInternal(url) || url.startsWith("data:")) return;
    event.preventDefault();
    openExternal(url);
  });
  void mainWindow.loadFile(path.join(__dirname, "splash.html"), { query: { lang: app.getLocale().toLowerCase().startsWith("es") ? "es" : "en" } });
}

async function boot() {
  Menu.setApplicationMenu(null);
  createWindow();
  try {
    const port = await findPort();
    origin = `http://127.0.0.1:${port}`;
    startServer(port);
    await waitForServer(port);
    if (mainWindow) await mainWindow.loadURL(`${origin}/`);
    setupAutoUpdate();
  } catch (error) {
    dialog.showErrorBox("Modus", error instanceof Error ? error.message : String(error));
    app.quit();
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(boot);
  app.on("before-quit", () => {
    app.isQuitting = true;
    serverProcess?.kill();
  });
  app.on("window-all-closed", () => app.quit());
}
