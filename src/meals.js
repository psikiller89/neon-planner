"use strict";
const SLOTS = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snack", "Snack"]];
const weekStart = k => { const d = parse(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
const weekDays = ws => Array.from({ length: 7 }, (_, i) => addDays(ws, i));
const recipeById = id => db.recipes.find(r => r.id === id);
const mealOf = (k, s) => db.meals[k]?.[s] || null;
const mealLabel = m => m ? (m.recipeId && recipeById(m.recipeId)?.name) || m.text || "" : "";
function setMeal(k, s, m) {
  db.meals[k] ??= {};
  if (m && (m.recipeId || m.text)) db.meals[k][s] = m; else delete db.meals[k][s];
  if (!Object.keys(db.meals[k]).length) delete db.meals[k];
}
function parseIng(line) {
  const m = line.trim().match(/^(\d+(?:[.,]\d+)?|\d+\/\d+)\s*(.*)$/);
  if (!m) return { qty: null, name: line.trim() };
  const q = m[1].includes("/") ? m[1].split("/").reduce((a, b) => a / b) : Number(m[1].replace(",", "."));
  return { qty: q, name: m[2].trim() };
}
function shoppingFor(ws) {
  const agg = new Map();
  for (const k of weekDays(ws)) for (const [s] of SLOTS) {
    const r = recipeById(mealOf(k, s)?.recipeId); if (!r) continue;
    for (const line of (r.ingredients || "").split("\n").filter(l => l.trim())) {
      const { qty, name } = parseIng(line), key = name.toLowerCase();
      const cur = agg.get(key) || { name, qty: 0, plain: false, from: new Set() };
      if (qty == null) cur.plain = true; else cur.qty += qty;
      cur.from.add(r.name); agg.set(key, cur);
    }
  }
  return [...agg.entries()].map(([key, v]) => ({ key, label: `${v.qty ? +v.qty.toFixed(2) + " " : ""}${v.name}`, from: [...v.from].join(", ") }))
    .sort((a, b) => a.label.replace(/^[\d.]+ /, "").localeCompare(b.label.replace(/^[\d.]+ /, "")));
}
const shopState = ws => (db.shopping[ws] ??= { checked: {}, extra: [] });
function mealsTodayPanel(k) {
  return `<div class="panel meals-today" style="padding:14px;margin-bottom:12px"><h3 class="panel-title">Meals today <button class="btn small" id="mtOpen" style="float:right">Plan</button></h3>
    ${SLOTS.map(([s, l]) => `<div class="mt-row"><span class="mt-slot">${l}</span><span class="${mealLabel(mealOf(k, s)) ? "" : "hint"}">${esc(mealLabel(mealOf(k, s)) || "—")}</span></div>`).join("")}</div>`;
}
function editMeal(k, s) {
  const m = mealOf(k, s) || {};
  const opts = [`<option value="">— Free text —</option>`, ...db.recipes.slice().sort((a, b) => a.name.localeCompare(b.name)).map(r => `<option value="${r.id}" ${m.recipeId === r.id ? "selected" : ""}>${esc(r.name)}</option>`)].join("");
  $("#modal .modal-box").innerHTML = `<h2>${SLOTS.find(x => x[0] === s)[1]} · ${esc(fmtDay(k))}</h2>
    <label class="lbl">Recipe</label><select id="mR" class="input">${opts}</select>
    <label class="lbl">Or type a meal</label><input id="mT" class="input" value="${esc(m.recipeId ? "" : m.text || "")}" placeholder="Leftovers, eat out, pizza night…">
    <p class="hint">Recipes add their ingredients to the week's shopping list.</p>
    <div class="modal-actions"><button class="btn danger" id="mClear">Clear</button><button class="btn" id="mCancel">Cancel</button><button class="btn primary" id="mSave">Save</button></div>`;
  $("#modal").classList.remove("hidden");
  const close = () => $("#modal").classList.add("hidden");
  $("#mCancel").onclick = close;
  $("#mClear").onclick = () => { setMeal(k, s, null); save(); close(); render(); };
  $("#mSave").onclick = () => { const rid = $("#mR").value, text = $("#mT").value.trim(); setMeal(k, s, rid ? { recipeId: rid } : { text }); save(); close(); render(); };
}
function editRecipe(r, isNew = false) {
  $("#modal .modal-box").innerHTML = `<h2>${isNew ? "New recipe" : "Edit recipe"}</h2>
    <div class="grid2"><div><label class="lbl">Name</label><input id="rN" class="input" value="${esc(r.name)}"></div><div><label class="lbl">Tags</label><input id="rG" class="input" value="${esc(r.tags || "")}" placeholder="Quick, vegetarian…"></div></div>
    <div class="grid2"><div><label class="lbl">Servings</label><input id="rS" type="number" min="1" class="input" value="${r.servings || ""}"></div><div><label class="lbl">Prep time (min)</label><input id="rP" type="number" min="0" class="input" value="${r.prep || ""}"></div></div>
    <label class="lbl">Ingredients (one per line, e.g. "2 eggs", "200 g pasta")</label><textarea id="rI" class="input" rows="6">${esc(r.ingredients || "")}</textarea>
    <label class="lbl">Steps / notes</label><textarea id="rD" class="input" rows="5">${esc(r.steps || "")}</textarea>
    <div class="modal-actions">${isNew ? "" : `<button class="btn danger" id="rDel">Delete</button>`}<button class="btn" id="rCancel">Cancel</button><button class="btn primary" id="rSave">Save</button></div>`;
  $("#modal").classList.remove("hidden"); $("#rN").focus();
  const close = () => $("#modal").classList.add("hidden");
  $("#rCancel").onclick = close;
  if (!isNew) $("#rDel").onclick = () => {
    if (!confirm(`Delete "${r.name}"? Meals using it will be cleared.`)) return;
    db.recipes = db.recipes.filter(x => x !== r);
    for (const k of Object.keys(db.meals)) for (const [s] of SLOTS) if (db.meals[k][s]?.recipeId === r.id) setMeal(k, s, null);
    save(); close(); render();
  };
  $("#rSave").onclick = () => {
    const name = $("#rN").value.trim(); if (!name) { $("#rN").focus(); return; }
    Object.assign(r, { name, tags: $("#rG").value.trim(), servings: Number($("#rS").value) || null, prep: Number($("#rP").value) || null, ingredients: $("#rI").value, steps: $("#rD").value });
    if (isNew) db.recipes.push(r); save(); close(); render();
  };
}
VIEWS.meals = {
  html() {
    const ws = ui.mealWeek ||= weekStart(ymd(new Date())), days = weekDays(ws), today = ymd(new Date()), tab = ui.mealTab || "week";
    const tabs = `<div class="tabs" style="margin-bottom:12px">${[["week", "Week plan"], ["recipes", `Recipes (${db.recipes.length})`], ["shop", "Shopping list"]].map(([t, l]) => `<button class="tab ${tab === t ? "on" : ""}" data-tab="${t}">${l}</button>`).join("")}</div>`;
    const nav = `<div class="day-head"><div class="day-title">Week of ${esc(parse(ws).toLocaleDateString([], { month: "long", day: "numeric" }))}</div>
      <button class="btn" id="wPrev">◀</button><button class="btn" id="wNow">This week</button><button class="btn" id="wNext">▶</button></div>`;
    if (tab === "recipes") {
      const q = (ui.recipeQ || "").toLowerCase(), list = db.recipes.filter(r => !q || `${r.name} ${r.tags} ${r.ingredients}`.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
      return `${tabs}<div class="row" style="margin-bottom:12px"><input id="rQ" class="input grow" placeholder="Search recipes…" value="${esc(ui.recipeQ || "")}"><button class="btn primary" id="rNew">+ New recipe</button></div>
        <div class="recipe-grid">${list.map(r => `<div class="panel recipe" data-id="${r.id}"><div class="rc-name">${esc(r.name)}</div>
          <div class="t-meta">${r.tags ? `<span class="badge cat">${esc(r.tags)}</span>` : ""}${r.servings ? `<span class="badge">${r.servings} servings</span>` : ""}${r.prep ? `<span class="badge">◷ ${r.prep} min</span>` : ""}</div>
          <div class="hint">${esc((r.ingredients || "").split("\n").filter(Boolean).length)} ingredients</div></div>`).join("") || `<div class="empty big">No recipes yet. Add one to build shopping lists automatically.</div>`}</div>`;
    }
    if (tab === "shop") {
      const st = shopState(ws), items = shoppingFor(ws), left = items.filter(i => !st.checked[i.key]).length + st.extra.filter(e => !e.done).length;
      return `${tabs}${nav}<div class="panel" style="padding:14px;max-width:720px"><h3 class="panel-title">Shopping list <span class="hint">(${left} left)</span></h3>
        <div class="row" style="margin-bottom:10px"><input id="sAdd" class="input grow" placeholder="Add an item and press Enter…"><button class="btn" id="sClear">Uncheck all</button></div>
        ${items.map(i => `<label class="shop-item ${st.checked[i.key] ? "done" : ""}"><input type="checkbox" data-key="${esc(i.key)}" ${st.checked[i.key] ? "checked" : ""}><span class="si-name">${esc(i.label)}</span><span class="hint">${esc(i.from)}</span></label>`).join("")}
        ${st.extra.map((e, n) => `<label class="shop-item ${e.done ? "done" : ""}"><input type="checkbox" data-extra="${n}" ${e.done ? "checked" : ""}><span class="si-name">${esc(e.text)}</span><button class="icon-btn" data-xdel="${n}" title="Remove">✕</button></label>`).join("")}
        ${items.length || st.extra.length ? "" : `<div class="empty">Plan meals with recipes this week, or add items above.</div>`}</div>`;
    }
    return `${tabs}${nav}<div class="hint" style="margin-bottom:8px">Click a slot to plan a meal.</div>
      <div class="meal-grid"><div></div>${days.map(k => `<div class="mh ${k === today ? "mh-today" : ""}">${esc(parse(k).toLocaleDateString([], { weekday: "short", day: "numeric" }))}</div>`).join("")}
      ${SLOTS.map(([s, l]) => `<div class="meal-slot-h">${l}</div>${days.map(k => { const lab = mealLabel(mealOf(k, s)); return `<div class="meal-cell ${lab ? "set" : ""} ${k === today ? "today" : ""}" data-day="${k}" data-slot="${s}">${esc(lab) || "+"}</div>`; }).join("")}`).join("")}</div>
      <div class="row" style="margin-top:12px"><button class="btn" id="wCopy">Copy last week</button><button class="btn danger" id="wClr">Clear this week</button></div>`;
  },
  mount(r) {
    $$("[data-tab]", r).forEach(b => b.onclick = () => { ui.mealTab = b.dataset.tab; render(); });
    const shift = n => { ui.mealWeek = addDays(ui.mealWeek, 7 * n); render(); };
    if ($("#wPrev", r)) { $("#wPrev", r).onclick = () => shift(-1); $("#wNext", r).onclick = () => shift(1); $("#wNow", r).onclick = () => { ui.mealWeek = weekStart(ymd(new Date())); render(); }; }
    $$(".meal-cell", r).forEach(c => c.onclick = () => editMeal(c.dataset.day, c.dataset.slot));
    if ($("#wCopy", r)) $("#wCopy", r).onclick = () => {
      const days = weekDays(ui.mealWeek), prev = weekDays(addDays(ui.mealWeek, -7));
      if (!prev.some(k => db.meals[k])) return toast("Nothing planned last week.");
      if (days.some(k => db.meals[k]) && !confirm("Replace this week's meals with last week's?")) return;
      days.forEach((k, i) => { delete db.meals[k]; if (db.meals[prev[i]]) db.meals[k] = structuredClone(db.meals[prev[i]]); });
      save(); render(); toast("Copied last week");
    };
    if ($("#wClr", r)) $("#wClr", r).onclick = () => { if (!confirm("Clear all meals this week?")) return; weekDays(ui.mealWeek).forEach(k => delete db.meals[k]); save(); render(); };
    if ($("#rNew", r)) $("#rNew", r).onclick = () => editRecipe({ id: uid(), name: "", tags: "", servings: null, prep: null, ingredients: "", steps: "" }, true);
    if ($("#rQ", r)) $("#rQ", r).oninput = e => { ui.recipeQ = e.target.value; const pos = e.target.selectionStart; render(); const q = $("#rQ"); q.focus(); q.setSelectionRange(pos, pos); };
    $$(".recipe", r).forEach(c => c.onclick = () => editRecipe(recipeById(c.dataset.id)));
    if ($("#sAdd", r)) {
      const st = shopState(ui.mealWeek);
      $("#sAdd", r).onkeydown = e => { if (e.key === "Enter" && e.target.value.trim()) { st.extra.push({ text: e.target.value.trim(), done: false }); save(); render(); $("#sAdd").focus(); } };
      $("#sClear", r).onclick = () => { st.checked = {}; st.extra.forEach(x => x.done = false); save(); render(); };
      $$("[data-key]", r).forEach(b => b.onchange = () => { if (b.checked) st.checked[b.dataset.key] = true; else delete st.checked[b.dataset.key]; save(); render(); });
      $$("[data-extra]", r).forEach(b => b.onchange = () => { st.extra[b.dataset.extra].done = b.checked; save(); render(); });
      $$("[data-xdel]", r).forEach(b => b.onclick = e => { e.preventDefault(); st.extra.splice(b.dataset.xdel, 1); save(); render(); });
    }
  }
};
