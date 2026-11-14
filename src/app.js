
"use strict";

const categories = window.RESEARCH_CATEGORIES;
const search = document.querySelector("#search");
const clear = document.querySelector("#clear");
const results = document.querySelector("#results-list");
const count = document.querySelector("#result-count");
const workspace = document.querySelector(".workspace");
const detail = document.querySelector("#detail");
const copyStatus = document.querySelector("#copy-status");
const missing = "Нет данных";
let selected = null;
let selectedRow = null;
let selectedIndicators = new Set();
let catalogTree;



function normalize(value) {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/\s+/g, " ");
}

const stopWords = new Set(["в", "во", "с", "со", "из", "и", "или", "на", "по", "для", "под", "к", "нормы", "норма", "показатель"]);
const indicatorAliases = [
  [/(?:бгкп|колиформ[а-я]*)/u, /(?:бгкп|колиформ)/u],
  [/(?:кмафанм|омч|общее микробное число)/u, /(?:кмафанм|\bомч\b|общее микробное число)/u],
  [/(?:стафилококк[а-я]*|s aureus)/u, /(?:стафилококк|s aureus)/u],
  [/(?:кишечная палочка|e coli)/u, /(?:кишечн[а-я]* палочк|e coli)/u],
  [/(?:сальмонелл[а-я]*)/u, /сальмонелл/u],
  [/(?:листер[а-я]*|listeria(?: monocytogenes)?)/u, /(?:листер|listeria)/u]
];
const productAliases = [
  [/^9\.16\.18\.1\.1$/, "макароны отварные макароны вареные"],
  [/^9\.16\.4(?:\.|$)/, "винегрет салат из вареных овощей"],
  [/^2\.7\.1$/, "брынза фета рассольный сыр"],
  [/^2\.2\.2$/, "ультрапастеризованное молоко увт uht асептический розлив"],
  [/^2\.8\.3$/, "топленое масло гхи"],
  [/^9\.16\.20\.4(?:\.|$)|^6\.11\.9(?:\.|$)/, "фреш свежевыжатый сок"]
];

function words(value) {
  return normalize(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function tokens(value) {
  return [...new Set(words(value).split(" ").filter(token => token && !stopWords.has(token)))];
}

function oneEditApart(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length > b.length) return oneEditApart(b, a);
  let index = 0;
  while (index < a.length && a[index] === b[index]) index++;
  if (a.length !== b.length) return a.slice(index) === b.slice(index + 1);
  return a.slice(index + 1) === b.slice(index + 1) ||
    (a[index] === b[index + 1] && a[index + 1] === b[index] && a.slice(index + 2) === b.slice(index + 2));
}

function wordMatch(query, word) {
  if (query === word) return 5;
  if (query.length >= 3 && word.startsWith(query)) return 4;
  if (query.length >= 5 && word.length >= 5 && oneEditApart(query, word)) return 2;
  let common = 0;
  while (common < query.length && query[common] === word[common]) common++;
  if (common >= 4 && query.length - common <= 3 && word.length - common <= 3) return 3;
  return 0;
}

const searchable = categories.map(category => {
  const title = words(category.title);
  const aliases = [...(category.synonyms ?? []),
    ...productAliases.filter(([code]) => code.test(category.code ?? "")).map(([, alias]) => alias)];
  return {
    category, title, titleTokens: tokens(title), aliases,
    aliasTokens: tokens(aliases.join(" ")),
    indicators: (category.indicators ?? []).map(indicator => ({indicator, name: words(indicator.name ?? "")}))
  };
});

const indicatorNames = new Set(searchable.flatMap(entry => entry.indicators.map(({name}) => name)));

function splitSearch(rawQuery) {
  let remaining = " " + words(rawQuery) + " ";
  const requirements = [];
  for (const [alias, name] of indicatorAliases) {
    const expression = new RegExp(" (?:" + alias.source + ")(?= )", "gu");
    if (!expression.test(remaining)) continue;
    requirements.push(value => name.test(value));
    remaining = remaining.replace(expression, " ");
  }
  const terms = tokens(remaining);
  // Treat standalone names such as «гистамин» as indicators. In mixed
  // queries, use a name only when there is also a separate product term.
  const matches = [...indicatorNames].filter(name =>
    name && (remaining.trim() === name || (" " + remaining.trim() + " ").includes(" " + name + " ") &&
      (name.includes(" ") || terms.length > 1 && /^(гистамин|нитрат[ыа]?|свинец|кадмий|мышьяк|ртуть)$/u.test(name))));
  matches.sort((a, b) => b.length - a.length);
  for (const name of matches) {
    if (!remaining.includes(" " + name + " ")) continue;
    requirements.push(value => value === name);
    remaining = remaining.replace(" " + name + " ", " ");
  }
  return {terms: tokens(remaining), requirements};
}

function findCategories(rawQuery) {
  const query = normalize(rawQuery);
  const codeQuery = /^\d+(?:[.\s‐‑–—-]+\d+)*[.]?$/u.test(query)
    ? query.replace(/[.\s‐‑–—-]+/gu, ".").replace(/\.$/, "")
    : "";
  const {terms, requirements} = codeQuery ? {terms: [], requirements: []} : splitSearch(query);
  const matches = [];

  for (const entry of searchable) {
    const {category, title, titleTokens, aliasTokens, indicators} = entry;
    const code = category.code ?? "";
    const exact = Boolean(codeQuery && code === codeQuery);
    if (codeQuery && !exact && !code.startsWith(codeQuery + ".")) continue;
    if (query && !codeQuery && !terms.length && !requirements.length) continue;
    const matchedGroups = requirements.map(matchesName => indicators.filter(({name}) => matchesName(name)));
    if (matchedGroups.some(group => !group.length)) continue;
    const matched = [...new Set(matchedGroups.flat().map(({indicator}) => indicator))];
    const titleScores = terms.map(term => Math.max(0, ...titleTokens.map(word => wordMatch(term, word))));
    const scores = terms.map((term, index) => Math.max(titleScores[index],
      ...aliasTokens.map(word => Math.max(0, wordMatch(term, word) - 1))));
    if (scores.some(score => score === 0)) continue;
    let score = scores.reduce((sum, value) => sum + value, 0);
    if (terms.length && title === words(query)) score += 30;
    else if (terms.length && title.includes(words(query))) score += 12;
    const explains = [];
    if (scores.some((value, index) => value > titleScores[index])) explains.push("По рабочему названию или синониму");
    else if (terms.length && scores.some(value => value <= 2)) explains.push("С учётом опечатки");
    if (matched.length) explains.push("Показатели: " + [...new Set(matched.map(indicator => indicator.name))].slice(0, 3).join(", "));
    matches.push({category, exact, score, matched, explanation: explains.join(" · ")});
  }
  return matches.sort((a, b) =>
    Number(b.exact) - Number(a.exact) || b.score - a.score ||
    Number(!a.category.code) - Number(!b.category.code) ||
    (a.category.code ?? "").localeCompare(b.category.code ?? "", "ru", { numeric: true })
  );
}

function cloneTemplate(id) {
  return document.querySelector(id).content.firstElementChild.cloneNode(true);
}

function field(container, selector, value) {
  const element = container.querySelector(selector);
  const text = value?.trim();
  element.textContent = text || missing;
  element.classList.toggle("missing", !text);
}

function renderResults() {
  const query = normalize(search.value);
  const matches = findCategories(query);
  document.querySelector("#result-heading").textContent = query ? "Результаты поиска" : "Каталог продукции";
  count.textContent = matches.length;
  count.setAttribute("aria-label", (query ? "Найдено категорий: " : "Карточек в каталоге: ") + matches.length);
  clear.hidden = search.value === "";
  results.replaceChildren();

  if (matches.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-results";
    const title = document.createElement("strong");
    title.textContent = "Ничего не найдено";
    const hint = document.createElement("p");
    hint.textContent = "Проверьте код или введите другую часть названия.";
    empty.append(title, hint);
    results.append(empty);
    return;
  }

  if (!query) {
    catalogTree ??= createCatalog(matches);
    results.append(catalogTree);
    return;
  }

  for (const match of matches) results.append(createResult(match));
}

function createCatalog(matches) {
  const tree = document.createElement("div");
  tree.className = "catalog-tree";

  // A branch may have cards of its own, for example the two chemistry cards at 7.2.
  const paths = matches.map(({ category }) => {
    const parts = category.code?.split(".") ?? [];
    const prefixes = parts.map((_, index) => parts.slice(0, index + 1).join("."));
    // Раздел 9.16 показываем на верхнем уровне каталога.
    return prefixes[1] === "9.16" ? prefixes.slice(1) : prefixes;
  });
  const branchCodes = new Set([
    ...Object.keys(groupTitles),
    ...paths.flatMap(path => path.slice(0, -1))
  ]);
  const groups = new Map();

  for (const [index, match] of matches.entries()) {
    const path = paths[index];
    const branches = branchCodes.has(path.at(-1)) ? path : path.slice(0, -1);
    if (match.category.catalogSubgroup !== "centralized-water" && (match.category.catalogSubgroup || !path.length)) {
      branches.push(match.category.catalogSubgroup ?? "water");
    }
    let parent = tree;
    for (const code of branches) {
      if (!groups.has(code)) {
        const branch = document.createElement("details");
        branch.className = "catalog-branch";
        const label = document.createElement("summary");
        if (!/^\d/.test(code)) {
          label.textContent = groupTitles[code];
        } else {
          const badge = document.createElement("span");
          badge.className = "code";
          badge.textContent = code.split("/")[0];
          label.append(badge);
          if (groupTitles[code]) label.append(" ", groupTitles[code]);
        }
        const children = document.createElement("div");
        children.className = "catalog-children";
        branch.append(label, children);
        parent.append(branch);
        groups.set(code, children);
      }
      parent = groups.get(code);
    }
    parent.append(createResult(match));
  }

  return tree;
}

function createResult({ category, exact, matched, explanation }) {
  const row = cloneTemplate("#result-template");
  row.setAttribute("aria-controls", "detail");
  row.setAttribute("aria-pressed", String(selected === category));
  row.querySelector(".result-meta").hidden = !category.code && !category.demo;
  row.querySelector(".code").hidden = !category.code;
  if (category.code) field(row, ".code", category.code);
  field(row, ".result-title", category.title);
  field(row, ".result-conditions", category.conditions);
  row.querySelector(".exact").hidden = !exact;
  row.querySelector(".demo-tag").hidden = !category.demo;
  if (explanation) {
    const synonym = row.querySelector(".synonym");
    synonym.textContent = explanation;
    synonym.hidden = false;
  }
  row.addEventListener("click", () => {
    selectedRow?.setAttribute("aria-pressed", "false");
    selected = category;
    selectedIndicators = new Set(matched);
    selectedRow = row;
    row.setAttribute("aria-pressed", "true");
    renderDetail();
    const heading = detail.querySelector("h2");
    heading.focus({ preventScroll: true });
    detail.scrollIntoView({ block: "nearest" });
  });
  return row;
}

function samplingForIndicator(indicator, category) {
  return indicator.sampling?.trim() ||
    (indicator.type === "Микробиологическое" ? category.sampling?.trim() : "") || "";
}

function compactBasis(value) {
  return value?.replace(/приложение (?=\d)/gi, "прил. ")
    .replace(/таблица (?=\d)/gi, "табл. ")
    .replace(/раздел (?=[\dIVX])/gi, "разд. ")
    .replace(/подпункт /gi, "подп. ")
    .replace(/пункт /gi, "п. ")
    .replace(/примечание /gi, "прим. ");
}

function compactSampling(value) {
  const general = "ГОСТ 31904-2012, разделы 4 и 5. Учитывайте требования документа на конкретный вид продукции (п. 4.5).";
  if (value.startsWith(general)) return "ГОСТ 31904-2012, разд. 4–5";
  return value.replace(" — отбор проб природной минеральной воды.", ";")
    .replace(" — отбор воды для микробиологического анализа.", "")
    .replace("разделы 4 и 5", "разд. 4–5");
}

async function copyIndicator(indicator, category, article) {
  const sampling = samplingForIndicator(indicator, category);
  const parts = [
    category.demo ? "ДЕМОНСТРАЦИОННЫЕ ДАННЫЕ" : "",
    [category.code, category.title].filter(Boolean).join(" — "),
    (indicator.type?.trim() || missing) + " · " + (indicator.name?.trim() || missing),
    "Норматив: " + (indicator.limit?.trim() || missing),
    "Основание: " + (indicator.basis?.trim() || missing),
    indicator.price ? "Прейскурант: " + indicator.price.code +
      (indicator.price.grouped ? " (один раз на всю группу)" : "") : "",
    sampling ? "Отбор проб: " + sampling : ""
  ];
  const value = parts.filter(Boolean).join("\n");
  const buttonLabel = article.querySelector(".copy span");
  const fallback = article.querySelector(".copy-fallback");
  const textarea = fallback.querySelector("textarea");
  copyStatus.textContent = "";

  try {
    await navigator.clipboard.writeText(value);
    fallback.hidden = true;
  } catch {
    textarea.value = value;
    fallback.hidden = false;
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, value.length);
    let copied = false;
    try {
      copied = document.execCommand?.("copy");
    } catch {
      // Some browsers block clipboard commands for local files.
    }
    if (!copied) {
      buttonLabel.textContent = "Копировать";
      copyStatus.textContent = "Текст выделен для ручного копирования";
      return;
    }
    article.querySelector(".copy").focus({ preventScroll: true });
    fallback.hidden = true;
  }

  buttonLabel.textContent = "Скопировано";
  copyStatus.textContent = "Показатель скопирован";
}



function groupReferences(group, selector, label, indicators, getReference, formatReference, absent) {
  const byReference = new Map();
  for (const indicator of indicators) {
    const reference = getReference(indicator)?.trim() || "";
    const names = byReference.get(reference) ?? [];
    names.push(indicator.name || missing);
    byReference.set(reference, names);
  }
  const cell = group.querySelector(selector);
  if (byReference.size <= 2) {
    for (const reference of byReference.keys()) {
      const item = document.createElement("span");
      item.textContent = reference ? formatReference(reference) : absent;
      if (reference) item.title = reference;
      cell.append(item);
    }
  } else {
    cell.textContent = byReference.size + " вариантов · см. по показателям";
  }
  if (byReference.size < 2) return;

  const mapping = document.createElement("details");
  mapping.className = "study-mapping";
  const summary = document.createElement("summary");
  summary.textContent = label + " по показателям";
  const list = document.createElement("dl");
  for (const [reference, names] of byReference) {
    const item = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = reference || absent;
    const definition = document.createElement("dd");
    definition.textContent = [...new Set(names)].join(", ");
    item.append(term, definition);
    list.append(item);
  }
  mapping.append(summary, list);
  group.querySelector(".study-mappings").append(mapping);
}

function renderPrice(article, indicator) {
  if (!indicator.price || indicator.price.grouped) return;
  article.classList.add('has-price');
  const cell = article.querySelector('.price-code');
  cell.hidden = false;
  const heading = document.createElement('span');
  heading.className = 'price-heading';
  heading.textContent = 'Прейскурант';
  const code = document.createElement('span');
  code.textContent = indicator.price.code;
  code.title = [indicator.price.source, indicator.price.note].filter(Boolean).join(' · ');
  cell.append(heading, code);
  if (indicator.price.preparation) code.title += " · Пробоподготовка " + indicator.price.preparation;

}

function createStudyGroup(type, indicators, category) {
  const group = cloneTemplate("#study-group-template");
  group.open = indicators.some(indicator => selectedIndicators.has(indicator));
  field(group, ".study-label", studyLabels[type] ?? type);
  group.querySelector(".count").textContent = indicators.length;
  groupReferences(group, ".study-basis", "Основания", indicators,
    indicator => indicator.basis, compactBasis, "Не указано");
  groupReferences(group, ".study-sampling", "Отбор проб", indicators,
    indicator => samplingForIndicator(indicator, category), compactSampling, "Не указан");

  const mappings = group.querySelector(".study-mappings");
  const groupedPrices = new Set(indicators.filter(({ price }) => price?.grouped)
    .map(({ price }) => price.code));
  for (const code of groupedPrices) {
    const note = document.createElement("p");
    note.className = "study-preparation";
    note.textContent = "Прейскурант · " + code + " (один раз на всю группу)";
    mappings.append(note);
  }

  const preparations = new Set(indicators.map(indicator => indicator.price?.preparation).filter(Boolean));
  for (const preparation of preparations) {
    const note = document.createElement("p");
    note.className = "study-preparation";
    const label = preparationLabels[preparation];
    note.textContent = "Пробоподготовка" + (label ? " " + label : "") + " · " + preparation;
    mappings.append(note);
  }

  const priceNotes = new Set(indicators.filter(({ price }) => price?.code === "Уточнить" || price?.code === "р. 8, п. 50")
    .map(({ price }) => price.note).filter(Boolean));
  for (const text of priceNotes) {
    const note = document.createElement("p");
    note.className = "study-preparation";
    note.textContent = text;
    mappings.append(note);
  }

  const rows = group.querySelector(".study-rows");
  for (const indicator of indicators) {
    const article = cloneTemplate("#indicator-template");
    article.classList.toggle("matched-indicator", selectedIndicators.has(indicator));
    field(article, "h4", indicator.name);
    field(article, ".limit", indicator.limit);
    renderPrice(article, indicator);
    const quantity = indicatorSamplingQuantity(indicator);
    if (quantity) {
      const note = document.createElement("p");
      note.className = "indicator-sampling-mass";
      note.textContent = "Масса для лаборатории: " + quantity;
      article.append(note);
    }
    article.querySelector(".copy").addEventListener("click", () => copyIndicator(indicator, category, article));
    rows.append(article);
  }
  return group;
}


const samplingSelections = new WeakMap();
const samplingMassUnknown = "Массу или объём уточнить в лаборатории.";

const laboratoryMassBasis = "Рабочая масса для передачи в лабораторию по практике приёма проб в лаборатории.";
const chemistryIndicatorGrams = 200;
const sensorySampleGrams = 300;
const glazeSample = ["3,0 кг", "или 3 целые рыбы с головой"];

function chemistryMeasurements(indicator) {
  const name = normalize(indicator.name);
  if (name.startsWith("левомицетин")) return ["chloramphenicol"];
  if (/^(?:антибиотики тетрациклиновой группы|тетрациклиновая группа)/.test(name)) return ["tetracyclines"];
  if (name.startsWith("бензойная кислота")) return ["benzoic"];
  if (name.startsWith("сорбиновая кислота")) return ["sorbic"];
  if (name.startsWith("сумма бензойной и сорбиновой кислот")) return ["benzoic", "sorbic"];
  return [];
}

function isGlazeIndicator(indicator) {
  return indicator.type === "Физико-химическое" && normalize(indicator.name) === "массовая доля глазури";
}

function indicatorSamplingQuantity(indicator) {
  if (isGlazeIndicator(indicator)) return glazeSample.join(" ");
  if (indicator.type !== "Санитарно-химическое") return "";
  const measurements = chemistryMeasurements(indicator);
  if (measurements.length === 2) return "расчёт по двум кислотам, без дополнительной массы";
  return measurements.length ? chemistryIndicatorGrams + " г" : "";
}

function selectedChemistryQuantity(indicators, code) {
  const measurements = indicators.map(chemistryMeasurements);
  const count = new Set(measurements.flat()).size;
  if (!count) return samplingQuantity(code, "chemistry");
  const total = count * chemistryIndicatorGrams + " г";
  return measurements.some(items => !items.length) ? [total + " на показатели с заданной массой", "На остальные — уточнить"] : [total];
}


const category9ChemistryMass = new Map([
  ...["1.1", "1.2.2", "2.1", "2.2.2", "3", "4.1", "4.2.2"].map(code => [code, "2 порции, суммарно не менее 200 г"]),
  ...["5.1", "5.2.2"].map(code => [code, "1–2 порции, суммарно не менее 200 г, если блюдо отбирают как закуску с мясом, птицей или рыбой"]),
  ["8", "1–2 порции, суммарно не менее 100 г"],
  ...["11.1", "11.2", "11.3", "12.1", "12.2", "12.3"].map(code => [code, "2–3 порции, суммарно не менее 300 г"]),
  ["18.1.2", "не менее 200 г для гарнира"],
  ["19", "не менее 200 г"],
  ["20.5", "2 порции, суммарно не менее 200 г для десерта с сахаром и/или соусом; для молочного желе — 2 порции, суммарно не менее 300 г"],
  ["20.6", "2 порции, суммарно не менее 200 г для десерта с сахаром и/или соусом"]
]);

function category9SamplingAmount(code, study) {
  if (!code?.startsWith("9.16.")) return "";
  const item = code.slice("9.16.".length);
  if (study === "chemistry") {
    if (item === "26") {
      return "Для тортов, пирожных и рулетов в штучной фасовке, а также весовых рулетов — объединённая проба от 400 г; для пирожных в лотках — от 300 г (ГОСТ 5904-2019, пп. 6.10.1–6.10.4, если применим; в карточке отмечен как вне ОА). Для выбранных показателей уточните в лаборатории массу и число проб.";
    }
    const amount = category9ChemistryMass.get(item);
    return amount
      ? "Для физико-химического отбора: " + amount + " (ГОСТ Р 54607.1-2011, табл. А.3). Достаточность для выбранных показателей и число проб подтвердите в лаборатории."
      : "Для этой продукции не подтверждена масса пробы на выбранные показатели. " + samplingMassUnknown;
  }

  const general = "ГОСТ 31904-2012, пп. 4.9–4.10: массу берут из документа на продукцию. Если масса не задана, для фасованной продукции — от 1 единицы на каждую единицу выборки; для указанных в п. 4.9.2 видов продукции — не более 1000 г (см³) на единицу выборки. Фактическую массу подтвердите в лаборатории.";
  if (item === "20.8") return "Для коктейля, идентифицированного как молочная продукция, сверить профильные документы. Для коктейля общепита подтвердить необходимый объём в лаборатории.";
  if (["20.1", "20.2", "20.4.1", "20.4.2", "21.2", "21.3", "22"].includes(item)) return general;
  return "Если применимы МУ 2657-82, п. 2.7.2.2: для готового блюда с раздачи — целая порция; из общей массы на производстве — около 200 г. Это ориентир для этого способа отбора. " + general;
}

function samplingQuantity(code, study) {
  if (!code?.startsWith("9.16.")) return ["Уточнить"];
  const item = code.slice(5);
  if (study === "microbiology") {
    const rule = category9SamplingAmount(code, study);
    return rule.includes("около 200 г")
      ? ["1 порция (с раздачи)", "≈200 г (из общей массы)"]
      : ["Уточнить"];
  }
  if (item === "26") return ["≥400 г (штучные изделия и весовые рулеты)", "≥300 г (пирожные в лотках)"];
  const rule = category9ChemistryMass.get(item);
  if (!rule) return ["Уточнить"];
  const mass = rule.match(/не менее (\d+) г/)[1];
  const portions = rule.match(/^([\d–]+) порции/)?.[1];
  const quantity = (portions ? portions + " порц. · " : "") + "≥" + mass + " г";
  return item === "20.5" ? [quantity, "≥300 г (молочное желе)"] : [quantity];
}

function showSamplingQuantity(cell, values) {
  cell.replaceChildren();
  for (const value of values) {
    const line = document.createElement("span");
    line.textContent = value;
    cell.append(line);
  }
}

function samplingDetails(rule, list) {
  const details = document.createElement("details");
  details.className = "sampling-references";
  const summary = document.createElement("summary");
  summary.textContent = "Основание и условия";
  const note = document.createElement("p");
  note.textContent = rule;
  details.append(summary, note, list);
  return details;
}

function samplingReferences(indicators, category, showNames) {
  const references = new Map();
  for (const indicator of indicators) {
    const reference = samplingForIndicator(indicator, category);
    const names = references.get(reference) ?? new Set();
    names.add(indicator.name || missing);
    references.set(reference, names);
  }

  const list = document.createElement("ul");
  for (const [reference, names] of references) {
    const item = document.createElement("li");
    item.textContent = reference || "Документ по отбору уточнить";
    if (showNames) {
      const indicators = document.createElement("div");
      indicators.textContent = [...names].join(", ");
      item.append(indicators);
    }
    list.append(item);
  }
  return list;
}

function renderSamplingPlan(card, groups, category) {
  const microbiology = groups.get("Микробиологическое") ?? [];
  const chemistry = groups.get("Санитарно-химическое") ?? [];
  const sensory = groups.get("Органолептическое") ?? [];
  const glaze = (groups.get("Физико-химическое") ?? []).filter(isGlazeIndicator);

  const plan = card.querySelector(".sampling-plan");
  const rows = plan.querySelector(".sampling-plan-rows");
  plan.hidden = false;

  if (microbiology.length) {
    const row = document.createElement("tr");
    const title = document.createElement("th");
    title.scope = "row";
    title.textContent = "Микробиология";
    title.append(samplingDetails(category9SamplingAmount(category.code, "microbiology") || samplingMassUnknown,
      samplingReferences(microbiology, category, false)));
    const amount = document.createElement("td");
    amount.className = "sampling-amount";
    showSamplingQuantity(amount, samplingQuantity(category.code, "microbiology"));
    row.append(title, amount);
    rows.append(row);
  }

  function appendFixedQuantity(name, quantity, indicators) {
    const row = document.createElement("tr");
    const title = document.createElement("th");
    const amount = document.createElement("td");
    title.scope = "row";
    title.textContent = name;
    amount.className = "sampling-amount";
    showSamplingQuantity(amount, quantity);
    title.append(samplingDetails(laboratoryMassBasis, samplingReferences(indicators, category, false)));
    row.append(title, amount);
    rows.append(row);
  }

  if (glaze.length) appendFixedQuantity("Массовая доля глазури", glazeSample, glaze);
  appendFixedQuantity(sensory.length ? "Органолептика" : "Органолептика (при назначении)",
    [sensorySampleGrams + " г на все органолептические показатели"], sensory);

  if (!chemistry.length) return;

  const chosen = samplingSelections.get(category) ?? new Set();
  samplingSelections.set(category, chosen);
  const row = document.createElement("tr");
  const title = document.createElement("th");
  title.scope = "row";
  title.textContent = "Санхимия";
  const count = document.createElement("p");
  count.setAttribute("role", "status");
  const picker = document.createElement("details");
  const toggle = document.createElement("summary");
  const options = document.createElement("div");
  options.className = "sampling-options";
  const amount = document.createElement("td");
  amount.className = "sampling-amount";
  const references = document.createElement("div");

  function updateSelection() {
    const selected = chemistry.filter(indicator => chosen.has(indicator));
    count.textContent = "Выбрано " + selected.length + " из " + chemistry.length;
    toggle.textContent = selected.length ? "Изменить выбор" : "Выбрать показатели";
    showSamplingQuantity(amount, selected.length ? selectedChemistryQuantity(selected, category.code) : ["—"]);
    references.replaceChildren();
    if (!selected.length) return;

    const notes = [];
    if (selected.some(indicator => chemistryMeasurements(indicator).length)) {
      notes.push(laboratoryMassBasis + " По 200 г на каждое определение.");
      if (selected.some(indicator => chemistryMeasurements(indicator).length === 2)) {
        notes.push("Сумма кислот рассчитывается по результатам двух определений без дополнительной массы.");
      }
    }
    if (selected.some(indicator => !chemistryMeasurements(indicator).length)) {
      notes.push(category9SamplingAmount(category.code, "chemistry") || samplingMassUnknown);
    }
    references.append(samplingDetails(notes.join(" "), samplingReferences(selected, category, true)));
  }

  for (const indicator of chemistry) {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = chosen.has(indicator);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) chosen.add(indicator);
      else chosen.delete(indicator);
      updateSelection();
    });
    const name = document.createElement("span");
    name.textContent = indicator.name || missing;
    if (chemistry.some(other => other !== indicator && other.name === indicator.name)) {
      name.textContent += " · " + [indicator.limit, indicator.basis].filter(Boolean).join(" · ");
    }
    label.append(checkbox, name);
    options.append(label);
  }

  picker.append(toggle, options);
  title.append(count, picker, references);
  row.append(title, amount);
  rows.append(row);
  updateSelection();
}

function renderDetail() {
  workspace.classList.toggle("show-detail", Boolean(selected));
  document.body.classList.toggle("has-selection", Boolean(selected));
  if (!selected) {
    detail.replaceChildren(cloneTemplate("#placeholder-template"));
    return;
  }

  const category = selected;
  const card = cloneTemplate("#detail-template");
  card.querySelector(".detail-meta").hidden = !category.code && !category.demo;
  card.querySelector(".code").hidden = !category.code;
  if (category.code) field(card, ".code", category.code);
  field(card, "h2", category.title);
  field(card, ".conditions", category.conditions);
  card.querySelector(".demo-tag").hidden = !category.demo;

  const indicators = category.indicators ?? [];
  card.querySelector(".count").textContent = indicators.length;
  const list = card.querySelector(".indicators");
  if (!indicators.length) {
    list.textContent = "Показатели пока не внесены.";
    if (category.sampling) {
      const sampling = document.createElement("p");
      sampling.textContent = "Отбор проб: " + category.sampling;
      list.append(sampling);
    }
  }

  const groups = new Map();
  for (const indicator of indicators) {
    const type = indicator.type?.trim() || "Прочие";
    const group = groups.get(type) ?? [];
    group.push(indicator);
    groups.set(type, group);
  }
  renderSamplingPlan(card, groups, category);
  for (const [type, group] of groups) list.append(createStudyGroup(type, group, category));
  card.querySelector(".back").addEventListener("click", () => {
    const row = selectedRow;
    selected = null;
    selectedRow = null;
    row?.setAttribute("aria-pressed", "false");
    renderDetail();
    (row ?? search).focus();
  });
  detail.replaceChildren(card);
}

function updateQuery() {
  selectedRow?.setAttribute("aria-pressed", "false");
  selectedRow = null;
  selected = null;
  renderResults();
  renderDetail();
}

if (Array.isArray(categories)) {
  const hasDemo = categories.some(category => category.demo);
  document.querySelector("#demo-notice").hidden = !hasDemo;
  document.querySelector("#search-hint").hidden = !hasDemo;
  search.addEventListener("input", updateQuery);
  clear.addEventListener("click", () => {
    search.value = "";
    updateQuery();
    search.focus();
  });
  for (const example of document.querySelectorAll("[data-query]")) {
    example.addEventListener("click", () => {
      search.value = example.dataset.query;
      updateQuery();
      search.focus();
    });
  }
  for (const shortcut of document.querySelectorAll("[data-section]")) {
    shortcut.addEventListener("click", () => {
      search.value = "";
      updateQuery();
      const code = shortcut.dataset.section;
      for (const branch of catalogTree.children) {
        if (branch.tagName !== "DETAILS") continue;
        const badge = branch.querySelector(":scope > summary .code");
        branch.open = code !== "all" && badge?.textContent.trim() === code;
        if (branch.open) branch.scrollIntoView({block: "start"});
      }
      if (code === "all") document.querySelector("#result-heading").scrollIntoView({block: "start"});
    });
  }
  updateQuery();
  document.querySelector("#catalog-fallback").remove();
  document.querySelector(".search-panel").hidden = false;
  detail.hidden = false;
}
