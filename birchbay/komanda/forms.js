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
  ["mode", "Ход станции", "#idea-mode"],
  ["capacity", "Мест одновременно", "#idea-capacity"],
  ["team", "Роли", "#idea-team"],
  ["materials", "Материалы", "#idea-materials"],
  ["probe", "Что уточнить", "#idea-probe"]
];
const element = (selector) => document.querySelector(selector);
const live = Boolean(globalThis.google?.script?.run);
const preview = !live && (location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(location.hostname));
const intake = element('meta[name="station-intake"]').content;
const previewKey = "festival-stations-submissions-v1";
let stations = globalThis.stationSeed ?? [];

const selected = new Set();
const filters = new Set();
const topicFilters = new Set();
const catalog = element("#catalog");
const proposal = element("#submission");
const proposalOpen = element("#proposal-open");
const selectAll = element("#select-all");
const query = element("#query");
const cards = element("#cards");
const stationDialog = element("#station-dialog");
const stationDialogPick = element("#station-dialog-pick");
let activeStationId = "";
let fullCatalog = true;
const ideaForm = element("#submission-form");
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
  selectionSubmit.hidden = selected.size === 0;
  selectionSubmit.disabled = selectionSubmit.hidden;
  element("#selection-count").textContent = selected.size ? String(selected.size) : "";
  selectionSubmit.setAttribute("aria-label", `Открыть отклик: выбрано ${selected.size}`);
  selectAll.checked = stations.length > 0 && selected.size === stations.length;
  selectAll.indeterminate = selected.size > 0 && selected.size < stations.length;
  const allAction = selectAll.checked ? "Снять все отметки" : "Выбрать все станции";
  selectAll.setAttribute("aria-label", allAction);
  element("#master-pick").title = allAction;
  const marked = stations.filter(station => selected.has(station.id));
  const list = element("#application-selection");
  list.hidden = marked.length === 0;
  list.replaceChildren(...marked.map(station => node("li", stationTitle(station))));
}

selectAll.addEventListener("change", () => {
  selected.clear();
  if (selectAll.checked) stations.forEach(station => selected.add(station.id));
  render();
});

const stateLabels = { open: "Черновик", interested: "Есть отклики", confirmed: "Ведущий подтверждён" };

function stationState(station) {
  return station.stage || (station.confirmed ? "confirmed" : station.people ? "interested" : "open");
}

function stationDetails(station) {
  const detail = node("article", "", "card-body");
  const overview = node("div", "", "card-overview");
  const summary = station.short || station.action;
  const meta = [stateLabels[stationState(station)], station.location].filter(Boolean);
  overview.append(node("p", meta.join(" · "), "card-meta"));
  overview.append(node("p", summary, "card-summary"));
  if (live && station.confirmed) overview.append(node("p", `Ведущий: ${station.confirmed}`, "card-lead"));
  if (live && station.people) overview.append(node("p", `Откликнулись: ${station.people}`, "card-people"));

  const running = node("section", "", "card-logistics");
  const facts = node("dl", "", "card-facts");
  for (const [key, label] of fields) describe(facts, label, station[key]);
  const labels = [...station.tags, ...(station.topics ?? [])];
  if (labels.length) describe(facts, "Форматы и темы", [...new Set(labels)].join(" · "));
  if (facts.childElementCount) running.append(node("h3", "Как провести"), facts);
  if (running.childElementCount) overview.append(running);
  detail.append(overview);

  const examples = node("div", "", "card-examples");
  const tasks = (station.tasks || "").split("\n").map(line => line.trim()).filter(Boolean);
  if (tasks.length) {
    const handout = node("section", "", "station-handout");
    const list = node("ol");
    for (const task of tasks) list.append(node("li", task));
    handout.append(node("h3", "Примеры заданий"), list);
    examples.append(handout);
  } else if (summary !== station.action) {
    examples.append(node("h3", "Что делают школьники"), node("p", station.action));
  }
  if (station.check || station.taskPrep) {
    const answers = node("section", "", "card-answers");
    answers.append(node("h3", "Ответы и заготовки"));
    if (station.check) answers.append(node("p", station.check));
    if (station.taskPrep) answers.append(node("p", station.taskPrep));
    examples.append(answers);
  }
  const sources = node("ul", "", "handout-sources");
  for (const line of (station.sources || "").split("\n")) {
    const [caption, href] = line.split(" | ");
    if (!href?.startsWith("https://")) continue;
    const link = node("a", caption || href);
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const item = node("li");
    item.append(link);
    sources.append(item);
  }
  if (sources.childElementCount) examples.append(node("h3", "Источники"), sources);
  if (examples.childElementCount) detail.append(examples);
  return detail;
}

function setStationSelected(id, checked) {
  if (checked) selected.add(id);
  else selected.delete(id);
  const row = document.getElementById(`station-${id}`);
  if (row) {
    row.dataset.selected = String(checked);
    row.querySelector(".station-tick input").checked = checked;
  }
  updateSelection();
}

function updateCatalogFill() {
  catalog.dataset.fill = String(fullCatalog);
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
  pick.addEventListener("change", () => setStationSelected(station.id, pick.checked));
  label.append(pick);
  row.append(label);

  const toggle = node("button", "", "station-toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-controls", stationDialog.id);
  toggle.setAttribute("aria-haspopup", "dialog");
  const stage = stationState(station);
  toggle.setAttribute("aria-label", stage === "open" ? title : `${title} · ${stateLabels[stage]}`);
  toggle.append(node("span", title, "station-title"));
  if (stage !== "open") {
    const mark = node("span", "", "station-state");
    mark.dataset.state = stage;
    mark.title = stateLabels[stage];
    mark.setAttribute("aria-hidden", "true");
    toggle.append(mark);
  }
  toggle.addEventListener("click", () => openStation(station));
  row.append(toggle);
  result.append(row);
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
  count.textContent = matches.length ? "" : "Ничего не найдено";
  element("#master-pick").hidden = !stations.length;
  count.setAttribute("aria-label", `Найдено станций: ${matches.length}`);
  element("#reset-catalog").hidden = !words.length && (matches.length > 0 || !(filters.size || topicFilters.size));
  const topicsButton = element("#toggle-filters");
  topicsButton.textContent = topicFilters.size ? `Темы · ${topicFilters.size}` : "Темы";
  topicsButton.setAttribute("aria-label", topicFilters.size ? `Темы, выбрано: ${topicFilters.size}` : "Темы");
  updateSelection();
}

function makeFilters(values, state, container) {
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
  }
}

function addChoices(container, values, fieldName) {
  for (const value of values) {
    const choice = node("label", "", "choice");
    const input = node("input");
    input.type = "checkbox";
    input.name = fieldName;
    input.value = value;
    choice.append(input, document.createTextNode(value));
    container.append(choice);
  }
}

makeFilters(tags, filters, "#filters");
makeFilters(topics, topicFilters, "#topic-filters");

element("#toggle-filters").addEventListener("click", event => {
  const button = event.currentTarget;
  const open = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(open));
  element("#filters-panel").dataset.open = String(open);
});

const headerMenu = element("#header-menu");
document.addEventListener("pointerdown", event => {
  if (headerMenu.open && !headerMenu.contains(event.target)) headerMenu.open = false;
});
const menuButton = headerMenu.querySelector("summary");
function closeMenu() {
  headerMenu.open = false;
  menuButton.focus();
}
headerMenu.addEventListener("keydown", event => {
  if (event.key === "Escape" && headerMenu.open) {
    event.preventDefault();
    closeMenu();
  }
});
query.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    closeMenu();
  }
});

function openStation(station, tasks = false) {
  activeStationId = station.id;
  element("#station-dialog-title").textContent = stationTitle(station);
  element("#station-dialog-content").replaceChildren(stationDetails(station));
  const picked = selected.has(station.id);
  stationDialogPick.setAttribute("aria-pressed", String(picked));
  element("#station-pick-label").textContent = picked ? "Снять отметку" : "Хочу провести";
  if (!stationDialog.open) stationDialog.showModal();
  stationDialog.scrollTop = 0;
  if (tasks) stationDialog.querySelector(".station-handout")?.scrollIntoView({ block: "nearest" });
}

let pressedOutside = false;
function isOutsideStation(event) {
  if (event.target !== stationDialog) return false;
  const bounds = stationDialog.getBoundingClientRect();
  return event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom;
}
stationDialog.addEventListener("pointerdown", event => { pressedOutside = isOutsideStation(event); });
stationDialog.addEventListener("click", event => {
  if (pressedOutside && isOutsideStation(event)) stationDialog.close();
  pressedOutside = false;
});
stationDialog.addEventListener("close", () => {
  document.getElementById(`station-${activeStationId}`)?.querySelector(".station-toggle")
    ?.focus({ preventScroll: true });
});
stationDialogPick.addEventListener("click", () => {
  setStationSelected(activeStationId, !selected.has(activeStationId));
  stationDialog.close();
});

function openLinkedStation() {
  const fragment = location.hash.slice(1);
  const match = /^(station-|tasks-)(.+)$/.exec(fragment);
  if (!match) return;
  const station = stations.find(entry => entry.id === match[2]);
  if (station) openStation(station, match[1] === "tasks-");
}

window.addEventListener("hashchange", openLinkedStation);

function sheetLink(url) {
  if (!url) return;
  const link = element("#sheet-link");
  link.href = url;
  link.hidden = false;
}

function clearCatalogFilters() {
  filters.clear();
  topicFilters.clear();
  for (const filter of document.querySelectorAll("#filters button, #topic-filters button")) filter.setAttribute("aria-pressed", "false");
  query.value = "";
  headerMenu.classList.remove("has-query");
}

query.addEventListener("input", () => {
  headerMenu.classList.toggle("has-query", Boolean(query.value.trim()));
  render();
});
element("#reset-catalog").addEventListener("click", () => {
  clearCatalogFilters();
  closeMenu();
  render();
});
const maxIdeas = 5;
const ideaList = element("#idea-list");
const addIdeaButton = element("#add-idea");
const participant = element("#participant");
const pending = new Map();
let mode = "pick";
let origin;
let saving = false;
const canSubmit = live || preview || Boolean(intake);

function updateIdeaNumbers() {
  const drafts = [...ideaList.children];
  drafts.forEach((draft, index) => {
    draft.querySelector("legend").textContent = drafts.length > 1 ? `Станция ${index + 1}` : "";
    const remove = draft.querySelector(".remove-idea");
    remove.hidden = drafts.length === 1;
    remove.setAttribute("aria-label", `Убрать станцию ${index + 1}`);
  });
  addIdeaButton.hidden = drafts.length >= maxIdeas;
}

function addIdea(focus = false) {
  const draft = element("#idea-template").content.firstElementChild.cloneNode(true);
  addChoices(draft.querySelector("[data-formats]"), tags, "format");
  addChoices(draft.querySelector("[data-topics]"), topics, "topic");
  draft.querySelector(".remove-idea").addEventListener("click", () => {
    const neighbor = draft.nextElementSibling || draft.previousElementSibling;
    draft.remove();
    updateIdeaNumbers();
    clearStatus();
    neighbor?.querySelector('[name="action"]').focus();
  });
  ideaList.append(draft);
  updateIdeaNumbers();
  if (focus) draft.querySelector('[name="action"]').focus();
  return draft;
}

function clearStatus() {
  ideaStatus.textContent = "";
  element("#submit-in-google").hidden = true;
}

function openSubmission(kind, button) {
  mode = kind;
  origin = button;
  element("#submission-feedback").hidden = true;
  const proposing = kind === "ideas";
  clearStatus();
  element("#submission-title").textContent = proposing ? "Новая станция" : "Выбранные станции";
  element("#application-summary").hidden = proposing;
  element("#proposal-fields").hidden = !proposing;
  if (proposing && !ideaList.children.length) addIdea();
  ideaSubmit.disabled = !canSubmit;
  if (!canSubmit) ideaStatus.textContent = "Запись с сайта пока недоступна.";
  proposal.showModal();
  (proposing ? ideaList.querySelector('[name="action"]') : participant).focus();
}

proposalOpen.addEventListener("click", () => openSubmission("ideas", proposalOpen));
selectionSubmit.addEventListener("click", () => openSubmission("pick", selectionSubmit));
addIdeaButton.addEventListener("click", () => {
  if (ideaList.children.length < maxIdeas) addIdea(true);
});
element("#close-submission").addEventListener("click", () => proposal.close());
proposal.addEventListener("cancel", event => {
  if (saving) event.preventDefault();
});
proposal.addEventListener("close", () => {
  (origin && !origin.closest("[hidden]") ? origin : proposalOpen).focus({ preventScroll: true });
});

function readIdea(draft) {
  const checked = field => [...draft.querySelectorAll(`[name="${field}"]:checked`)].map(input => input.value);
  const idea = { tags: checked("format"), topics: checked("topic") };
  for (const field of draft.querySelectorAll("input:not([type=checkbox]),textarea")) {
    idea[field.name] = field.value.trim();
  }
  return idea;
}

function readPreview() {
  try { return JSON.parse(localStorage.getItem(previewKey) || "{}"); }
  catch { return {}; }
}

function resetSubmission(stationIds) {
  for (const id of stationIds) selected.delete(id);
  if (mode === "ideas") {
    ideaList.replaceChildren();
    addIdea();
  }
  render();
}

ideaForm.addEventListener("input", () => { if (canSubmit) clearStatus(); });
ideaForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (saving || !canSubmit) return;
  const stationIds = mode === "pick" ? [...selected] : [];
  const drafts = mode === "ideas" ? [...ideaList.children] : [];
  const name = participant.value.trim().replace(/[^\S\r\n]+/g, " ");
  if (!name || /[\n\r,;]/.test(name)) {
    ideaStatus.textContent = "Напишите, как вас записать.";
    participant.focus();
    return;
  }
  const ideas = [];
  for (const draft of drafts) {
    const idea = readIdea(draft);
    if (idea.action) ideas.push(idea);
    else if (drafts.length === 1 || Object.values(idea).some(value => value.length)) {
      ideaStatus.textContent = "Напишите, что будут делать на станции.";
      draft.querySelector('[name="action"]').focus();
      return;
    }
  }
  if (!stationIds.length && !ideas.length) {
    ideaStatus.textContent = "Напишите, что будут делать на станции.";
    ideaList.querySelector('[name="action"]')?.focus();
    return;
  }
  const data = { stationIds, name, ideas };

  const fingerprint = JSON.stringify(data);
  let requestId = pending.get(fingerprint);
  if (!requestId) {
    requestId = crypto.randomUUID();
    pending.set(fingerprint, requestId);
  }
  if (preview) {
    const saved = readPreview();
    const storedIdeas = Array.isArray(saved.ideas) ? saved.ideas : [];
    const added = ideas.map((idea, index) => ({
      ...idea, id: index ? `${requestId}-${index + 1}` : requestId, status: "Идея"
    }));
    try {
      localStorage.setItem(previewKey, JSON.stringify({ name, ideas: [...storedIdeas, ...added] }));
    } catch {
      ideaStatus.textContent = "Не удалось сохранить предпросмотр в этом браузере.";
      return;
    }
    stations = [...stations, ...added];
    resetSubmission(stationIds);
    pending.delete(fingerprint);
    ideaStatus.textContent = "Сохранено в этом браузере.";
    proposal.close();
    announceSubmission(ideaStatus.textContent);
    return;
  }

  saving = true;
  const controls = [...proposal.querySelectorAll("button,input,textarea")].filter(field => !field.disabled);
  controls.forEach(field => { field.disabled = true; });
  ideaStatus.textContent = "Отправляем…";
  try {
    if (live) {
      const result = await googleCall("saveApplication", { ...data, requestId });
      stations = result.stations;
    } else {
      await saveToIntake({ ...data, requestId, installationId: getInstallationId() });
      refreshPublicCatalog();
    }
    resetSubmission(stationIds);
    pending.delete(fingerprint);
    proposal.close();
    announceSubmission("Записано в таблицу. Можно отправить ещё.");
  } catch (error) {
    if (intake && !live) element("#submit-in-google").hidden = false;
    ideaStatus.textContent = error.message || "Не удалось отправить. Попробуйте ещё раз.";
  } finally {
    saving = false;
    controls.forEach(field => { field.disabled = false; });
  }
});

let installationId = "";
let activePayload;

function getInstallationId() {
  if (installationId) return installationId;
  try {
    installationId = localStorage.getItem("festival-installation") || crypto.randomUUID();
    localStorage.setItem("festival-installation", installationId);
  } catch {
    installationId ||= crypto.randomUUID();
  }
  return installationId;
}

async function saveToIntake(payload) {
  activePayload = payload;
  const url = new URL(intake);
  url.searchParams.set("response", "json");
  let result;
  try {
    const response = await fetch(url, {
      method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "text/plain" },
      redirect: "follow", credentials: "omit", signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error();
    result = await response.json();
  } catch {
    throw new Error("Не удалось подтвердить запись. Попробуйте ещё раз или отправьте через Google.");
  }
  if (result.ok !== true) throw new Error("Таблица не приняла заявку. Попробуйте ещё раз.");
}

element("#submit-in-google").addEventListener("click", () => {
  const form = node("form");
  form.method = "post";
  form.action = intake;
  form.target = "_blank";
  const data = node("input");
  data.type = "hidden";
  data.name = "payload";
  data.value = JSON.stringify(activePayload);
  form.append(data);
  document.body.append(form);
  form.submit();
  form.remove();
});

async function refreshPublicCatalog() {
  if (!intake || live || preview) return;
  try {
    const url = new URL(intake);
    url.searchParams.set("view", "catalog");
    const response = await fetch(url, { credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    const result = await response.json();
    if (!Array.isArray(result.stations) || !result.stations.every(station => typeof station.action === "string")) return;
    const present = new Set(result.stations.map(station => station.id));
    for (const id of selected) if (!present.has(id)) selected.delete(id);
    stations = result.stations;
    render();
  } catch {
    return;
  }
}

function announceSubmission(message) {
  const feedback = element("#submission-feedback");
  feedback.hidden = false;
  feedback.textContent = message;
}

if (live) {
  element("#catalog-status").textContent = "Загружаем станции…";
  catalog.hidden = false;
  googleCall("listStations").then((result) => {
    stations = result.stations;
    sheetLink(result.sheetUrl);
    proposalOpen.hidden = false;
    render();
    openLinkedStation();
  }).catch(() => {
    element("#catalog-status").textContent = "Не удалось загрузить станции. Попробуйте обновить страницу.";
  });
} else {
  sheetLink("https://docs.google.com/spreadsheets/d/1_-AZ2h8Fq_GWkSKkp-a6S1Gc4gWQIEbKwZvOWYt6vDA/edit");
  proposalOpen.hidden = false;
  catalog.hidden = false;
  if (preview) {
    const saved = readPreview();
    participant.value = saved.name || "";
    if (Array.isArray(saved.ideas)) stations = [...stations, ...saved.ideas];
  }
  render();
  openLinkedStation();
  refreshPublicCatalog();
}
