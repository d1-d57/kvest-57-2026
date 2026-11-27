"use strict";

const tags = ["Игра", "Задача", "Мастерская", "Эксперимент", "Выступление"];
const topics = ["Логика", "Геометрия", "Коды", "Конструкции", "Рисунки", "Вероятность", "Подвижные игры"];
const aliases = new Map([
  ["арт", "рисунк"], ["искусство", "рисунк"], ["узор", "рисунк"],
  ["скульптура", "конструкц"], ["конструирование", "конструкц"],
  ["головоломки", "логик"], ["стратегии", "стратег"], ["шифры", "шифр"],
  ["спорт", "спортзал"], ["гонка", "подвижные"],
  ["узел", "узлы"], ["снежинка", "снежин"]
]);
const fields = [
  ["mode", "Как проходит заход", "#idea-mode"],
  ["capacity", "Одновременно", "#idea-capacity"],
  ["team", "Работа ведущих", "#idea-team"],
  ["materials", "Реквизит, раздатка и закупки", "#idea-materials"],
  ["probe", "Что проверить", "#idea-probe"]
];
const element = (selector) => document.querySelector(selector);
const live = Boolean(globalThis.google?.script?.run);
const preview = !live && (location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(location.hostname));
const previewKey = "festival-stations-submissions-v1";
let requestId = "";
let stations = globalThis.stationSeed ?? [];

const selected = new Set();
const expanded = new Set();
const filters = new Set();
const topicFilters = new Set();
const catalog = element("#catalog");
const proposal = element("#proposal");
const query = element("#query");
const cards = element("#cards");
let fullCatalog = true;
const selection = element("#selection");
const ideaForm = element("#idea-form");
const ideaStatus = element("#idea-status");
const ideaSubmit = element("#idea-submit");
const selectionSubmit = element("#selection-submit");

function node(tag, text, className) {
  const item = document.createElement(tag);
  if (text) item.textContent = text;
  if (className) item.className = className;
  return item;
}

function normalize(text) {
  return String(text ?? "").toLocaleLowerCase("ru").replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function describe(list, title, text) {
  if (text) list.append(node("dt", title), node("dd", text));
}

function googleCall(name, ...args) {
  return new Promise((resolve, reject) => {
    const runner = google.script.run.withSuccessHandler(resolve).withFailureHandler(reject);
    runner[name](...args);
  });
}

function stationTitle(station) {
  if (station.title) return station.title;
  return station.action.length > 70 ? station.action.slice(0, 67) + "…" : station.action;
}

function updateSelection() {
  selection.hidden = selected.size === 0 || proposal.open;
  const count = element("#selection-count");
  count.textContent = String(selected.size);
  count.setAttribute("aria-label", `Отмечено станций: ${selected.size}`);
  const marked = stations.filter(station => selected.has(station.id));
  const list = element("#selection-titles");
  const disclosure = element("#selection-list");
  list.replaceChildren(...marked.map(station => {
    const name = stationTitle(station);
    const row = node("li");
    const remove = node("button", "Снять", "plain");
    remove.type = "button";
    remove.setAttribute("aria-label", `Снять отметку — ${name}`);
    remove.addEventListener("click", () => {
      selected.delete(station.id);
        render();
      (selected.size ? element("#selection-count") : query).focus();
    });
    row.append(node("span", name), remove);
    return row;
  }));
  if (!marked.length) disclosure.open = false;
  const application = element("#application-selection");
  application.hidden = !marked.length;
  application.textContent = marked.length ? "Вы отметили\n" + marked.map(stationTitle).join(", ") : "";
}

function stationDetails(station) {
  const detail = node("article", "", "card-body");
  const overview = node("div", "", "card-overview");
  const summary = station.short || station.action;
  overview.append(node("p", summary, "card-summary"));
  if (live && station.confirmed) {
    overview.append(node("p", `Ведущий: ${station.confirmed}`, "card-lead"));
  } else {
    overview.append(node("p", "Ведущий пока не выбран", "card-lead"));
  }
  if (live && station.people) {
    overview.append(node("p", `Откликнулись: ${station.people}`, "card-people"));
  }
  const meta = [station.location, station.status || "Идея"].filter(Boolean);
  overview.append(node("p", meta.join(" · "), "card-meta"));
  detail.append(overview);

  const tasks = (station.tasks || "").split("\n").map(line => line.trim()).filter(Boolean);
  if (tasks.length) {
    const handout = node("details", "", "station-handout");
    const list = node("ol");
    for (const task of tasks) list.append(node("li", task));
    handout.append(node("summary", "Задания"), list);
    if (station.check || station.taskPrep) {
      const check = node("details", "", "handout-check");
      check.append(node("summary", "Проводящему"));
      if (station.check) check.append(node("p", station.check));
      if (station.taskPrep) check.append(node("p", station.taskPrep, "handout-preparation"));
      handout.append(check);
    }
    const sources = node("ul", "", "handout-sources");
    for (const line of (station.sources || "").split("\n")) {
      const [label, href] = line.split(" | ");
      if (!href?.startsWith("https://")) continue;
      const link = node("a", label || href);
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const item = node("li");
      item.append(link);
      sources.append(item);
    }
    if (sources.childElementCount) handout.append(sources);
    detail.append(handout);
  }

  const running = node("details", "", "card-logistics");
  const facts = node("dl", "", "card-facts");
  if (!tasks.length && summary !== station.action) describe(facts, "Задание", station.action);
  for (const [key, label] of fields) describe(facts, label, station[key]);
  const labels = [...station.tags, ...(station.topics ?? [])];
  if (labels.length) describe(facts, "Форматы и темы", [...new Set(labels)].join(" · "));
  if (facts.childElementCount) {
    running.append(node("summary", "Проведение"), facts);
    detail.append(running);
  }

  return detail;
}

function updateCatalogFill() {
  catalog.dataset.fill = String(fullCatalog && expanded.size === 0);
}

function card(station) {
  const result = node("li", "", "card");
  result.id = `station-${station.id}`;
  const title = stationTitle(station);
  const row = node("div", "", "station-row");

  const label = node("label", "", "station-tick");
  const pick = node("input");
  pick.type = "checkbox";
  pick.checked = selected.has(station.id);
  pick.setAttribute("aria-label", `Отметить — ${title}`);
  result.dataset.selected = String(pick.checked);
  pick.addEventListener("change", () => {
    if (pick.checked) selected.add(station.id);
    else selected.delete(station.id);
    result.dataset.selected = String(pick.checked);
    updateSelection();
  });
  label.append(pick);
  row.append(label);

  const detail = stationDetails(station);
  detail.id = `details-${station.id}`;

  const toggle = node("button", "", "station-toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-controls", detail.id);
  toggle.setAttribute("aria-label", title);
  toggle.append(node("span", title, "station-title"));
  function update() {
    const open = expanded.has(station.id);
    detail.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  }
  update();
  toggle.addEventListener("click", () => {
    if (expanded.has(station.id)) expanded.delete(station.id);
    else expanded.add(station.id);
    update();
    updateCatalogFill();
  });
  row.append(toggle);
  result.append(row, detail);
  return result;
}

function render() {
  const words = normalize(query.value).split(" ").filter(Boolean).map(word => aliases.get(word) || word);
  const matches = stations.filter(station => {
    const stationTopics = station.topics ?? [];
    const terms = normalize([station.title, station.short, station.location, station.action, station.keywords,
      station.team, station.materials, ...station.tags, ...stationTopics].join(" ")).split(" ");
    return [...filters].every(tag => station.tags.includes(tag))
      && [...topicFilters].every(topic => stationTopics.includes(topic))
      && words.every(word => terms.some(term => word.length < 4 ? term === word : term.startsWith(word)));
  });
  fullCatalog = !filters.size && !topicFilters.size && !words.length;
  cards.replaceChildren(...matches.map(card));
  updateCatalogFill();
  const count = element("#catalog-status");
  count.textContent = String(matches.length);
  count.setAttribute("aria-label", `Найдено станций: ${matches.length}`);
  element("#reset-catalog").hidden = matches.length > 0 || !(filters.size || topicFilters.size || words.length);
  const topicsButton = element("#toggle-filters");
  topicsButton.textContent = topicFilters.size ? `Темы · ${topicFilters.size}` : "Темы";
  topicsButton.setAttribute("aria-label", topicFilters.size ? `Темы, выбрано: ${topicFilters.size}` : "Темы");
  updateSelection();
}

function makeFilters(values, state, container, ideaContainer, fieldName) {
  for (const value of values) {
    const filter = node("button", value);
    filter.type = "button";
    filter.setAttribute("aria-pressed", "false");
    filter.addEventListener("click", () => {
      if (state.has(value)) state.delete(value);
      else state.add(value);
      filter.setAttribute("aria-pressed", String(state.has(value)));
      render();
    });
    element(container).append(filter);
    const choice = node("label", "", "choice");
    const input = node("input");
    input.type = "checkbox";
    input.name = fieldName;
    input.value = value;
    choice.append(input, document.createTextNode(value));
    element(ideaContainer).append(choice);
  }
}

makeFilters(tags, filters, "#filters", "#idea-tags", "format");
makeFilters(topics, topicFilters, "#topic-filters", "#idea-topics", "topic");

element("#toggle-filters").addEventListener("click", event => {
  const button = event.currentTarget;
  const open = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(open));
  element("#filters-panel").dataset.open = String(open);
});

const info = element("#info-control");
const infoButton = element("#info-toggle");
const infoPanel = element("#info-panel");
let infoHovered = false;
let infoFocused = false;
let infoPinned = false;
let infoDismissed = false;

function renderInfo() {
  const show = !infoDismissed && (infoHovered || infoFocused || infoPinned);
  infoPanel.hidden = !show;
  infoButton.setAttribute("aria-expanded", String(show));
}

info.addEventListener("pointerenter", event => {
  if (event.pointerType !== "mouse") return;
  infoHovered = true;
  infoDismissed = false;
  renderInfo();
});
info.addEventListener("pointerleave", event => {
  if (event.pointerType !== "mouse") return;
  infoHovered = false;
  renderInfo();
});
infoButton.addEventListener("focus", () => {
  infoFocused = true;
  infoDismissed = false;
  renderInfo();
});
info.addEventListener("focusout", event => {
  if (info.contains(event.relatedTarget)) return;
  infoFocused = false;
  renderInfo();
});
infoButton.addEventListener("click", () => {
  infoPinned = !infoPinned;
  infoDismissed = !infoPinned;
  renderInfo();
});
function dismissInfo() {
  infoPinned = false;
  infoDismissed = true;
  renderInfo();
}
document.addEventListener("pointerdown", event => {
  if (!info.contains(event.target) && !infoPanel.hidden) dismissInfo();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !infoPanel.hidden) dismissInfo();
});

function openLinkedStation() {
  const fragment = location.hash.slice(1);
  const taskLink = fragment.startsWith("tasks-");
  if (!taskLink && !fragment.startsWith("station-")) return;
  const card = document.getElementById(taskLink ? `station-${fragment.slice(6)}` : fragment);
  const toggle = card?.querySelector(".station-toggle");
  if (toggle?.getAttribute("aria-expanded") === "false") toggle.click();
  const handout = taskLink && card?.querySelector(".station-handout");
  if (handout) handout.open = true;
  card?.scrollIntoView();
}

window.addEventListener("hashchange", openLinkedStation);

function sheetLink(url) {
  if (!url) return;
  const link = element("#sheet-link");
  link.href = url;
  link.hidden = false;
  element("#info-sheet").hidden = false;
}

function clearCatalogFilters() {
  filters.clear();
  topicFilters.clear();
  for (const filter of document.querySelectorAll("#filters button, #topic-filters button")) filter.setAttribute("aria-pressed", "false");
  query.value = "";
}

query.addEventListener("input", render);
element("#reset-catalog").addEventListener("click", () => {
  clearCatalogFilters();
  render();
  query.focus();
});
element("#clear-selected").addEventListener("click", () => {
  selected.clear();
  render();
  query.focus();
});

proposal.addEventListener("toggle", () => {
  if (!proposal.open) proposal.querySelector("summary").textContent = "Предложить станцию";
  updateSelection();
});
function openSubmission() {
  element("#selection-list").open = false;
  proposal.querySelector("summary").textContent = "Ваш выбор";
  proposal.open = true;
  element("#participant").focus();
  proposal.scrollIntoView({ block: "nearest" });
}
selectionSubmit.addEventListener("click", openSubmission);
element("#flexible-open").addEventListener("click", () => {
  element("#any-station").checked = true;
  openSubmission();
});

function readIdea(action) {
  const data = new FormData(ideaForm);
  const station = {
    action,
    title: element("#title").value.trim(),
    location: element("#location").value.trim(),
    tags: data.getAll("format"),
    topics: data.getAll("topic")
  };
  for (const [key, , selector] of fields) station[key] = element(selector).value.trim();
  for (const key of ["tasks", "check", "taskPrep", "sources"]) station[key] = element(`#idea-${key}`).value.trim();
  return station;
}

function readPreview() {
  try { return JSON.parse(localStorage.getItem(previewKey) || "{}"); }
  catch { return {}; }
}

function resetSubmission(name, stationIds) {
  for (const id of stationIds) selected.delete(id);
  requestId = "";
  ideaForm.reset();
  proposal.querySelector("summary").textContent = "Предложить станцию";
  element("#participant").value = name;
  render();
}

ideaForm.addEventListener("input", () => {
  requestId = "";
  ideaStatus.textContent = "";
});
ideaForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const action = element("#idea").value.trim();
  const stationIds = [...selected];
  const name = element("#participant").value.trim();
  const anyStation = element("#any-station").checked;
  if (!stationIds.length && !action && !anyStation) {
    ideaStatus.textContent = "Отметьте станцию, предложите свою или выберите «Могу провести любую станцию».";
    element("#idea").focus();
    return;
  }
  if (!name || /[\n\r,;]/.test(name)) {
    ideaStatus.textContent = "Напишите, как вас записать.";
    element("#participant").focus();
    return;
  }

  if (!requestId) requestId = crypto.randomUUID();
  const submission = { stationIds, anyStation, name, idea: action ? readIdea(action) : null, requestId };
  if (preview) {
    const saved = readPreview();
    const ideas = Array.isArray(saved.ideas) ? saved.ideas : [];
    if (submission.idea) {
      const added = { ...submission.idea, id: requestId, status: "Идея" };
      ideas.push(added);
      stations = [...stations, added];
    }
    try {
      localStorage.setItem(previewKey, JSON.stringify({ name, ideas }));
    } catch {
      resetSubmission(name, stationIds);
      ideaStatus.textContent = "Принято для этой вкладки.";
      return;
    }
    resetSubmission(name, stationIds);
    ideaStatus.textContent = "Сохранено в предпросмотре. Можно отправить ещё.";
    return;
  }
  if (!live) {
    ideaStatus.textContent = "Для записи откройте Google-таблицу по значку.";
    return;
  }

  ideaSubmit.disabled = true;
  const flexibleOpen = element("#flexible-open");
  flexibleOpen.disabled = true;
  const fieldsToLock = [...ideaForm.querySelectorAll("input,textarea")].filter(field => !field.disabled);
  fieldsToLock.forEach(field => { field.disabled = true; });
  ideaStatus.textContent = "Отправляем…";
  try {
    const result = await googleCall("saveApplication", submission);
    stations = result.stations;
    resetSubmission(name, stationIds);
    ideaStatus.textContent = "Записано в таблицу. Можно отправить ещё.";
  } catch (error) {
    ideaStatus.textContent = error.message || "Не удалось отправить. Попробуйте ещё раз.";
  } finally {
    fieldsToLock.forEach(field => { field.disabled = false; });
    ideaSubmit.disabled = false;
    flexibleOpen.disabled = false;
  }
});

if (live) {
  element("#catalog-status").textContent = "Загружаем карточки…";
  catalog.hidden = false;
  googleCall("listStations").then((result) => {
    stations = result.stations;
    sheetLink(result.sheetUrl);
    proposal.hidden = false;
    element("#flexible-open").hidden = false;
    render();
    openLinkedStation();
  }).catch(() => {
    element("#catalog-status").textContent = "Не удалось прочитать таблицу. Проверьте доступ или напишите Ване.";
  });
} else {
  sheetLink("https://docs.google.com/spreadsheets/d/1_-AZ2h8Fq_GWkSKkp-a6S1Gc4gWQIEbKwZvOWYt6vDA/edit");
  proposal.hidden = false;
  element("#flexible-open").hidden = false;
  catalog.hidden = false;
  if (preview) {
    element("#preview-note").hidden = false;
    const saved = readPreview();
    element("#participant").value = saved.name || "";
    if (Array.isArray(saved.ideas)) stations = [...stations, ...saved.ideas];
  } else {
    element("#static-note").hidden = false;
  }
  render();
  openLinkedStation();
}
