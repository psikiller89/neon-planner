"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = k => new Date(`${k}T00:00`);
const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return ymd(d); };
const PRI = { high: { label: "High", color: "#ff2e97" }, med: { label: "Medium", color: "#ffd31a" }, low: { label: "Low", color: "#2de2ff" } };
const REMIND = [["", "No reminder"], ["0", "At time"], ["5", "5 min before"], ["10", "10 min before"], ["15", "15 min before"], ["30", "30 min before"], ["60", "1 hour before"], ["120", "2 hours before"], ["1440", "1 day before"]];
const REPEAT = [["none", "Once"], ["daily", "Every day"], ["weekdays", "Weekdays"], ["weekly", "Every week"], ["monthly", "Every month"]];
let db = null, saveTimer = null;
const ui = { view: "day", day: ymd(new Date()), month: ymd(new Date()).slice(0, 7) };

function occursOn(t, key) {
  if (key < t.date) return false; const d = parse(key);
  switch (t.repeat) {
    case "daily": return true;
    case "weekdays": return d.getDay() >= 1 && d.getDay() <= 5;
    case "weekly": return d.getDay() === parse(t.date).getDay();
    case "monthly": return d.getDate() === parse(t.date).getDate();
    default: return key === t.date;
  }
}
const tasksOn = key => db.tasks.filter(t => occursOn(t, key)).sort((a, b) => (a.time || "99") .localeCompare(b.time || "99") || a.title.localeCompare(b.title));
const isDone = (t, key) => (t.doneDates || []).includes(key);
function save() {
  $("#saveState").textContent = "Saving…"; clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => { await window.planner.save(db); $("#saveState").textContent = "Saved"; }, 250);
}
function toast(m) { const t = $("#toast"); t.textContent = m; t.className = ""; clearTimeout(t._h); t._h = setTimeout(() => t.classList.add("hidden"), 2800); }
function fmtDay(k) { return parse(k).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }); }
function go(view, o = {}) { Object.assign(ui, { view }, o); render(); }
function render() {
  $$(".nav").forEach(b => b.classList.toggle("active", b.dataset.view === ui.view || (ui.view === "day" && b.dataset.view === "day")));
  $("#campaignName").textContent = { day: ui.day === ymd(new Date()) ? "Today" : fmtDay(ui.day), week: "Next 7 days", month: "Calendar", meals: "Meal Planner", settings: "Settings" }[ui.view];
  const v = VIEWS[ui.view]; $("#view").innerHTML = v.html(); v.mount?.($("#view")); updateNext();
}
function updateNext() {
  const now = new Date(), key = ymd(now), hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const next = tasksOn(key).find(t => t.time && t.time >= hm && !isDone(t, key));
  $("#nextUp").textContent = next ? `Next up: ${next.time} · ${next.title}` : "Nothing else scheduled today";
}
function taskRow(t, key) {
  const now = new Date(), overdue = !isDone(t, key) && t.time && (key < ymd(now) || (key === ymd(now) && t.time < `${pad(now.getHours())}:${pad(now.getMinutes())}`));
  const rem = REMIND.find(r => r[0] === String(t.remind ?? ""));
  return `<div class="task ${isDone(t, key) ? "done" : ""} ${overdue ? "overdue" : ""}" data-id="${t.id}" style="--pc:${PRI[t.priority]?.color || "#2de2ff"}">
    <input type="checkbox" ${isDone(t, key) ? "checked" : ""}>
    <span class="t-time">${esc(t.time || "—")}</span>
    <div style="flex:1;min-width:0"><div class="t-title">${esc(t.title)}</div>
      <div class="t-meta">${t.category ? `<span class="badge cat">${esc(t.category)}</span>` : ""}${t.repeat && t.repeat !== "none" ? `<span class="badge">↻ ${REPEAT.find(r => r[0] === t.repeat)[1]}</span>` : ""}${rem && rem[0] !== "" ? `<span class="badge">◷ ${rem[1]}</span>` : ""}${t.notes ? `<span>${esc(t.notes.slice(0, 80))}</span>` : ""}</div></div>
    <button class="icon-btn" data-edit title="Edit">✎</button><button class="icon-btn" data-del title="Delete">✕</button></div>`;
}
function bindTasks(r, key) {
  $$(".task", r).forEach(el => {
    const t = db.tasks.find(x => x.id === el.dataset.id); if (!t) return; const k = el.dataset.day || key;
    $("input[type=checkbox]", el).onchange = e => { t.doneDates ??= []; t.doneDates = e.target.checked ? [...new Set([...t.doneDates, k])] : t.doneDates.filter(x => x !== k); save(); render(); };
    $("[data-edit]", el).onclick = () => editTask(t);
    $("[data-del]", el).onclick = () => { if (confirm(`Delete "${t.title}"${t.repeat !== "none" ? " (all repeats)" : ""}?`)) { db.tasks = db.tasks.filter(x => x !== t); save(); render(); } };
  });
}
function editTask(t, isNew = false) {
  const opt = (list, v) => list.map(([k, l]) => `<option value="${k}" ${String(v ?? "") === k ? "selected" : ""}>${l}</option>`).join("");
  $("#modal .modal-box").innerHTML = `<h2>${isNew ? "New task" : "Edit task"}</h2>
    <label class="lbl">Title</label><input id="fT" class="input" value="${esc(t.title)}">
    <div class="grid2"><div><label class="lbl">Date</label><input id="fD" type="date" class="input" value="${t.date}"></div><div><label class="lbl">Time</label><input id="fH" type="time" class="input" value="${t.time || ""}"></div></div>
    <div class="grid2"><div><label class="lbl">Priority</label><select id="fP" class="input">${opt(Object.entries(PRI).map(([k, v]) => [k, v.label]), t.priority)}</select></div><div><label class="lbl">Category</label><input id="fC" class="input" value="${esc(t.category || "")}" placeholder="Work, Home, D&D…"></div></div>
    <div class="grid2"><div><label class="lbl">Reminder</label><select id="fR" class="input">${opt(REMIND, t.remind)}</select></div><div><label class="lbl">Repeat</label><select id="fX" class="input">${opt(REPEAT, t.repeat)}</select></div></div>
    <label class="lbl">Notes</label><textarea id="fN" class="input" rows="3">${esc(t.notes || "")}</textarea>
    <p class="hint">Reminders need a time. They pop up as desktop notifications even when the window is closed (the app keeps running in the tray).</p>
    <div class="modal-actions"><button class="btn" id="fCancel">Cancel</button><button class="btn primary" id="fSave">Save</button></div>`;
  $("#modal").classList.remove("hidden"); $("#fT").focus();
  $("#fCancel").onclick = () => $("#modal").classList.add("hidden");
  $("#fSave").onclick = () => {
    const title = $("#fT").value.trim(); if (!title) { $("#fT").focus(); return; }
    Object.assign(t, { title, date: $("#fD").value || ui.day, time: $("#fH").value, priority: $("#fP").value, category: $("#fC").value.trim(), remind: $("#fR").value === "" ? null : Number($("#fR").value), repeat: $("#fX").value, notes: $("#fN").value });
    if (t.remind != null && !t.time) toast("Add a time so the reminder can fire.");
    if (isNew) db.tasks.push(t); save(); $("#modal").classList.add("hidden"); render();
  };
}
const newTask = (o = {}) => ({ id: uid(), title: "", date: ui.day, time: "", priority: "med", category: "", remind: null, repeat: "none", notes: "", doneDates: [], created: Date.now(), ...o });

const VIEWS = {};
VIEWS.day = {
  html() {
    const k = ui.day, list = tasksOn(k), done = list.filter(t => isDone(t, k)).length;
    return `<div class="day-head"><div class="day-title">${esc(fmtDay(k))}</div>
        <button class="btn" id="dPrev">◀</button><button class="btn" id="dToday">Today</button><button class="btn" id="dNext">▶</button><input id="dPick" type="date" class="input" style="width:170px" value="${k}"></div>
      <div class="hint">${done} of ${list.length} done</div><div class="progress"><div style="width:${list.length ? done / list.length * 100 : 0}%"></div></div>
      <div class="day-grid"><div>
        <div class="quick-add panel" style="padding:10px">
          <input id="qT" class="input" placeholder="Add a task and press Enter…"><input id="qH" type="time" class="input">
          <select id="qP" class="input">${Object.entries(PRI).map(([key, v]) => `<option value="${key}" ${key === "med" ? "selected" : ""}>${v.label}</option>`).join("")}</select>
          <select id="qR" class="input">${REMIND.map(([key, l]) => `<option value="${key}">${l}</option>`).join("")}</select>
          <select id="qX" class="input">${REPEAT.map(([key, l]) => `<option value="${key}">${l}</option>`).join("")}</select>
          <button class="btn primary" id="qAdd">+ Add</button></div>
        ${list.map(t => taskRow(t, k)).join("") || `<div class="empty big">Nothing planned. Add your first task above.</div>`}
      </div><div>${mealsTodayPanel(k)}<div class="panel" style="padding:14px"><h3 class="panel-title">Notes for the day</h3>
        <textarea id="dNotes" class="input" rows="18" placeholder="Ideas, journal, shopping list…">${esc(db.notes[k] || "")}</textarea></div></div></div>`;
  },
  mount(r) {
    $("#dPrev", r).onclick = () => go("day", { day: addDays(ui.day, -1) }); $("#dNext", r).onclick = () => go("day", { day: addDays(ui.day, 1) });
    $("#dToday", r).onclick = () => go("day", { day: ymd(new Date()) }); $("#dPick", r).onchange = e => e.target.value && go("day", { day: e.target.value });
    $("#dNotes", r).oninput = e => { db.notes[ui.day] = e.target.value; if (!e.target.value) delete db.notes[ui.day]; save(); };
    const add = () => { const title = $("#qT", r).value.trim(); if (!title) return;
      const remind = $("#qR", r).value === "" ? null : Number($("#qR", r).value), time = $("#qH", r).value;
      db.tasks.push(newTask({ title, time, priority: $("#qP", r).value, remind, repeat: $("#qX", r).value }));
      if (remind != null && !time) toast("Add a time so the reminder can fire.");
      save(); render(); $("#qT").focus(); };
    $("#qAdd", r).onclick = add; $("#qT", r).onkeydown = e => { if (e.key === "Enter") add(); };
    $("#mtOpen", r).onclick = () => go("meals", { mealTab: "week", mealWeek: weekStart(ui.day) });
    bindTasks(r, ui.day);
  }
};
VIEWS.week = {
  html() {
    const today = ymd(new Date());
    return Array.from({ length: 7 }, (_, i) => addDays(today, i)).map(k => { const l = tasksOn(k);
      return `<div class="panel week-day"><h3 class="panel-title" data-day="${k}">${i0(k, today)} · ${esc(fmtDay(k))} <span class="hint">(${l.length})</span></h3>
        ${l.map(t => taskRow(t, k).replace('class="task', `data-day="${k}" class="task`)).join("") || `<div class="hint">Free day.</div>`}</div>`; }).join("");
  },
  mount(r) { $$("h3[data-day]", r).forEach(h => h.onclick = () => go("day", { day: h.dataset.day })); bindTasks(r, ui.day); }
};
const i0 = (k, today) => k === today ? "Today" : k === addDays(today, 1) ? "Tomorrow" : parse(k).toLocaleDateString([], { weekday: "short" });
VIEWS.month = {
  html() {
    const [y, m] = ui.month.split("-").map(Number), first = new Date(y, m - 1, 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    const today = ymd(new Date()); let cells = "";
    for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); const k = ymd(d), l = tasksOn(k);
      cells += `<div class="mc ${d.getMonth() !== m - 1 ? "other" : ""} ${k === today ? "today" : ""}" data-day="${k}"><div class="dn">${d.getDate()}</div>
        ${l.slice(0, 3).map(t => `<div class="mt ${isDone(t, k) ? "done" : ""}" style="border-left:3px solid ${PRI[t.priority]?.color};padding-left:4px">${esc(t.time ? t.time + " " : "")}${esc(t.title)}</div>`).join("")}${l.length > 3 ? `<div class="hint">+${l.length - 3} more</div>` : ""}${db.notes[k] ? `<div class="hint">✎ note</div>` : ""}</div>`; }
    return `<div class="day-head"><div class="day-title">${first.toLocaleDateString([], { month: "long", year: "numeric" })}</div><button class="btn" id="mPrev">◀</button><button class="btn" id="mNow">This month</button><button class="btn" id="mNext">▶</button></div>
      <div class="month-grid">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => `<div class="mh">${d}</div>`).join("")}${cells}</div>`;
  },
  mount(r) {
    const shift = n => { const [y, m] = ui.month.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); go("month", { month: `${d.getFullYear()}-${pad(d.getMonth() + 1)}` }); };
    $("#mPrev", r).onclick = () => shift(-1); $("#mNext", r).onclick = () => shift(1); $("#mNow", r).onclick = () => go("month", { month: ymd(new Date()).slice(0, 7) });
    $$(".mc", r).forEach(c => c.onclick = () => go("day", { day: c.dataset.day }));
  }
};
VIEWS.settings = {
  html() {
    return `<div class="panel" style="padding:18px;max-width:640px"><h3 class="panel-title">Reminders</h3>
      <div class="row"><button class="btn" id="sTest">Send a test notification</button></div>
      <p class="hint">Closing the window keeps Neon Planner running in the system tray so reminders still pop up. Use Quit in the tray menu to stop it.</p>
      <label class="row" style="margin-top:12px;gap:10px"><input type="checkbox" id="sAuto" ${db.settings?.autostart ? "checked" : ""} style="width:18px;height:18px;accent-color:#ff2e97"> Start Neon Planner when I log in (hidden in the tray)</label>
      <h3 class="panel-title" style="margin-top:20px">Your data</h3>
      <div class="row"><button class="btn" id="sExp">Export</button><button class="btn" id="sImp">Import</button></div>
      <p class="hint">Saved automatically in ~/.config/Neon Planner/planner.json.</p></div>`;
  },
  mount(r) {
    $("#sTest", r).onclick = async () => toast((await window.planner.testNotify()) ? "Test notification sent" : "Notifications aren't supported on this desktop");
    $("#sAuto", r).onchange = async e => { await window.planner.setAutostart(e.target.checked); db.settings.autostart = e.target.checked; toast(e.target.checked ? "Will start at login" : "Won't start at login"); };
    $("#sExp", r).onclick = async () => { const p = await window.planner.exportData(db); if (p) toast("Exported to " + p); };
    $("#sImp", r).onclick = async () => { if (!confirm("Replace your current planner with the imported file?")) return; const d = await window.planner.importData(); if (d) { db = d; db.meals ??= {}; db.recipes ??= []; db.shopping ??= {}; render(); toast("Imported"); } };
  }
};
function tick() { const n = new Date(); $("#clock").textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}`; if (ymd(n) !== tick.last) { tick.last = ymd(n); if (ui.view !== "settings") render(); } else updateNext(); }
async function init() {
  db = await window.planner.load();
  db.tasks ??= []; db.notes ??= {}; db.settings ??= { autostart: false }; db.meals ??= {}; db.recipes ??= []; db.shopping ??= {};
  window.planner.onExternalChange(d => { db.fired = d.fired; });
  $$(".nav").forEach(b => b.onclick = () => go(b.dataset.view, b.dataset.view === "day" ? { day: ymd(new Date()) } : {}));
  document.addEventListener("keydown", e => { if (e.key === "Escape") $("#modal").classList.add("hidden"); });
  $("#modal").addEventListener("mousedown", e => { if (e.target.id === "modal") $("#modal").classList.add("hidden"); });
  render(); tick(); setInterval(tick, 15000);
}
document.addEventListener("DOMContentLoaded", init);
