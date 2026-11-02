const { app, BrowserWindow, ipcMain, dialog, Notification, Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

const DIR = app.getPath("userData");
const FILE = path.join(DIR, "planner.json");
const ICON = path.join(__dirname, "src", "icon.png");
let win = null, tray = null, quitting = false, data = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => showWindow());

function blank() { return { version: 1, tasks: [], notes: {}, fired: {}, settings: { autostart: false } }; }
function load() {
  try { data = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : blank(); }
  catch { fs.copyFileSync(FILE, `${FILE}.corrupt-${Date.now()}`); data = blank(); }
  data.tasks ??= []; data.notes ??= {}; data.fired ??= {}; data.settings ??= { autostart: false };
}
function persist() {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${FILE}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, FILE);
}

const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function occursOn(t, day) {
  const key = ymd(day);
  if (key < t.date) return false;
  switch (t.repeat) {
    case "daily": return true;
    case "weekdays": return day.getDay() >= 1 && day.getDay() <= 5;
    case "weekly": return day.getDay() === new Date(`${t.date}T00:00`).getDay();
    case "monthly": return day.getDate() === new Date(`${t.date}T00:00`).getDate();
    default: return key === t.date;
  }
}

function checkReminders() {
  if (!data) return;
  const now = new Date(); let changed = false;
  for (const offset of [0, 1]) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const key = ymd(day);
    for (const t of data.tasks) {
      if (t.remind == null || t.remind === "" || !t.time || !occursOn(t, day)) continue;
      if ((t.doneDates || []).includes(key)) continue;
      const [h, m] = t.time.split(":").map(Number);
      const due = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      const trigger = new Date(due.getTime() - Number(t.remind) * 60000);
      const fk = `${t.id}@${key}`;
      if (now >= trigger && now - trigger < 6 * 3600000 && trigger.getTime() >= (t.created || 0) - 60000 && !data.fired[fk]) {
        data.fired[fk] = Date.now(); changed = true;
        notify(t.title, Number(t.remind) ? `In ${t.remind} min, at ${t.time}` : `Now, ${t.time}`);
      }
    }
  }
  const cutoff = Date.now() - 3 * 86400000;
  for (const [k, v] of Object.entries(data.fired)) if (v < cutoff) { delete data.fired[k]; changed = true; }
  if (changed) { persist(); win?.webContents.send("data:changed", data); }
}

function notify(title, body) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: `Reminder: ${title}`, body, icon: ICON, urgency: "critical" });
  n.on("click", showWindow); n.show();
}

function setAutostart(on) {
  const dir = path.join(os.homedir(), ".config", "autostart"); const file = path.join(dir, "neon-planner.desktop");
  if (on) {
    fs.mkdirSync(dir, { recursive: true });
    const exec = process.env.APPIMAGE || process.execPath;
    fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=Neon Planner\nExec="${exec}" --hidden\nIcon=neon-planner\nX-GNOME-Autostart-enabled=true\n`);
  } else if (fs.existsSync(file)) fs.unlinkSync(file);
  data.settings.autostart = on; persist(); return on;
}

function showWindow() { if (!win) createWindow(); win.show(); win.focus(); }
function createWindow() {
  win = new BrowserWindow({ width: 1280, height: 860, minWidth: 900, minHeight: 600, backgroundColor: "#120826", title: "Neon Planner", icon: ICON,
    autoHideMenuBar: true, show: !process.argv.includes("--hidden"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false } });
  win.loadFile(path.join(__dirname, "src", "index.html"));
  win.on("close", e => { if (!quitting) { e.preventDefault(); win.hide(); } });
}

ipcMain.handle("data:load", () => data);
ipcMain.handle("data:save", (_e, d) => { const fired = data.fired; data = d; data.fired = { ...fired, ...(d.fired || {}) }; persist(); checkReminders(); return true; });
ipcMain.handle("notify:test", () => { notify("Test reminder", "Notifications are working."); return Notification.isSupported(); });
ipcMain.handle("autostart:set", (_e, on) => setAutostart(on));
ipcMain.handle("data:export", async (_e, d) => {
  const r = await dialog.showSaveDialog({ defaultPath: `neon-planner-${ymd(new Date())}.json` });
  if (r.canceled || !r.filePath) return false; fs.writeFileSync(r.filePath, JSON.stringify(d, null, 1)); return r.filePath;
});
ipcMain.handle("data:import", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "Planner", extensions: ["json"] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  fs.copyFileSync(FILE, `${FILE}.before-import-${Date.now()}`);
  data = JSON.parse(fs.readFileSync(r.filePaths[0], "utf8")); persist(); return data;
});

app.whenReady().then(() => {
  load(); createWindow();
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 22, height: 22 }));
  tray.setToolTip("Neon Planner");
  tray.setContextMenu(Menu.buildFromTemplate([{ label: "Open Neon Planner", click: showWindow }, { type: "separator" }, { label: "Quit", click: () => { quitting = true; app.quit(); } }]));
  tray.on("click", showWindow);
  checkReminders(); setInterval(checkReminders, 20000);
});
app.on("before-quit", () => { quitting = true; });
app.on("window-all-closed", e => e?.preventDefault?.());
