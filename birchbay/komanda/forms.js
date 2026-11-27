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
let stations = globalThis.stationSeed ?? [];

const selected = new Set();
const expanded = new Set();
const filters = new Set();
const topicFilters = new Set();
const catalog = element("#catalog");
const proposal = element("#submission");
const proposalOpen = element("#proposal-open");
const selectAll = element("#select-all");
const query = element("#query");
const cards = element("#cards");
let fullCatalog = true;
const selection = element("#selection");
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
  selection.hidden = selected.size === 0;
  selectAll.checked = stations.length > 0 && selected.size === stations.length;
  selectAll.indeterminate = selected.size > 0 && selected.size < stations.length;
  element("#selection-count").textContent = `Выбрано ${selected.size}`;
  const marked = stations.filter(station => selected.has(station.id));
  const list = element("#application-selection");
  list.hidden = selectAll.checked;
  list.replaceChildren(...marked.map(station => node("li", stationTitle(station))));
  element("#application-count").textContent = selectAll.checked
    ? `Все станции · ${selected.size}` : `Выбрано ${selected.size}`;
}

selectAll.addEventListener("change", () => {
  selected.clear();
  if (selectAll.checked) stations.forEach(station => selected.add(station.id));
  render();
});

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
  count.textContent = fullCatalog && stations.length ? "" : `Найдено ${matches.length}`;
  element("#master-pick").hidden = !stations.length;
  element("#select-all-label").textContent = `Все ${stations.length}`;
  selectAll.setAttribute("aria-label", `Выбрать все станции (${stations.length})`);
  count.setAttribute("aria-label", `Найдено станций: ${matches.length}`);
  element("#reset-catalog").hidden = matches.length > 0 || !(filters.size || topicFilters.size || words.length);
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
const maxIdeas = 5;
const ideaList = element("#idea-list");
const addIdeaButton = element("#add-idea");
const participant = element("#participant");
const draftFallback = element("#draft-fallback");
const pending = new Map();
let mode = "pick";
let origin;
let saving = false;
if (!live && !preview) ideaSubmit.textContent = "Открыть черновик в Telegram";

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
  draftFallback.hidden = true;
  draftFallback.open = false;
}

function openSubmission(kind, button) {
  mode = kind;
  origin = button;
  element("#submission-feedback").hidden = true;
  const proposing = kind === "ideas";
  clearStatus();
  element("#submission-title").textContent = proposing ? "Предложить станцию" : "Выбранные станции";
  element("#application-summary").hidden = proposing;
  element("#proposal-fields").hidden = !proposing;
  if (proposing && !ideaList.children.length) addIdea();
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

function prepareTelegram({ stationIds, name, ideas }) {
  const link = new URL(element("#direct").href);
  const lines = [`Привет! Это ${name}. Про фестиваль 13 декабря.`];
  if (stationIds.length === stations.length && stationIds.length) {
    lines.push("Могу провести любую станцию.");
  } else if (stationIds.length) {
    lines.push("Хочу провести:", ...stations.filter(station => selected.has(station.id))
      .map(station => `• ${stationTitle(station)}`));
  }
  ideas.forEach((idea, index) => {
    lines.push("", `Станция${ideas.length > 1 ? ` ${index + 1}` : ""}${idea.title ? ` — ${idea.title}` : ""}`, idea.action);
    const details = [["location", "Локация"], ["tags", "Форматы"], ["topics", "Темы"], ...fields,
      ["tasks", "Задания"], ["check", "Проверка решения"], ["taskPrep", "Заготовки"], ["sources", "Источники"]];
    for (const [key, label] of details) {
      const value = Array.isArray(idea[key]) ? idea[key].join(", ") : idea[key];
      if (value) lines.push(`${label}: ${value}`);
    }
  });
  const message = lines.join("\n");
  element("#draft-text").value = message;
  element("#open-chat").href = link.href;
  draftFallback.hidden = false;
  link.searchParams.set("text", message);
  if (link.href.length > 7500 || [...message].length > 4096) {
    element("#draft-fallback-label").textContent = "Черновик Telegram";
    draftFallback.open = true;
    ideaStatus.textContent = "Черновик длинный. Скопируйте текст и вставьте его в Telegram.";
    element("#copy-draft").focus();
    return;
  }
  element("#draft-fallback-label").textContent = "Telegram не открылся?";
  element("#open-chat").href = link.href;
  ideaStatus.textContent = "Нажмите «Отправить» в Telegram.";
  element("#open-chat").click();
}

element("#copy-draft").addEventListener("click", async () => {
  const draft = element("#draft-text");
  try {
    await navigator.clipboard.writeText(draft.value);
    ideaStatus.textContent = "Текст скопирован.";
  } catch {
    draft.focus();
    draft.select();
    ideaStatus.textContent = "Текст выделен. Скопируйте его.";
  }
});

ideaForm.addEventListener("input", clearStatus);
ideaForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (saving) return;
  const stationIds = mode === "pick" ? [...selected] : [];
  const drafts = mode === "ideas" ? [...ideaList.children] : [];
  const name = participant.value.trim();
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
  if (!live && !preview) {
    prepareTelegram(data);
    return;
  }

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
    const result = await googleCall("saveApplication", { ...data, requestId });
    stations = result.stations;
    resetSubmission(stationIds);
    pending.delete(fingerprint);
    proposal.close();
    announceSubmission("Записано в таблицу. Можно отправить ещё.");
  } catch (error) {
    ideaStatus.textContent = error.message || "Не удалось отправить. Попробуйте ещё раз.";
  } finally {
    saving = false;
    controls.forEach(field => { field.disabled = false; });
  }
});

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
}
