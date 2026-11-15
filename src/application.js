function parseApplicationTariff(value) {
  const match = value?.trim().match(/^р\.\s*(\d+)\s*,\s*п(?:п)?\.\s*(\d+(?:\.\d+)*(?:\s*,\s*\d+(?:\.\d+)*)*)$/u);
  if (!match) return null;
  const section = Number(match[1]);
  if (section < 1 || section > 3999) return null;
  return { section, items: match[2].split(/\s*,\s*/) };
}

function applicationRoman(number) {
  const numerals = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
  ];
  let result = "";
  for (const [value, symbol] of numerals) {
    result += symbol.repeat(Math.floor(number / value));
    number %= value;
  }
  return result;
}

// These tariff items bill each distinct selected measurement within the sample.
const perMeasurementTariffs = new Set(["7:55.1", "7:55.2", "8:50", "8:103", "8:341"]);

function applicationTariffs(indicators) {
  const sections = new Map();
  const uncertainties = new Set();
  const preparations = new Map();

  function addItems(tariff, measurement) {
    const items = sections.get(tariff.section) ?? new Map();
    sections.set(tariff.section, items);
    for (const item of tariff.items) {
      const measurements = items.get(item) ?? new Set();
      if (measurement && perMeasurementTariffs.has(tariff.section + ":" + item)) {
        measurements.add(measurement);
      }
      items.set(item, measurements);
    }
  }

  for (const { name, type, price } of indicators) {
    const measurement = JSON.stringify([type, name.trim().toLocaleLowerCase("ru")
      .replace(/\s*\(отдельная строка таблицы\)$/u, "")]);
    const tariff = parseApplicationTariff(price?.code);
    if (!tariff) {
      const options = price?.code && price.code !== "Уточнить" ? price.code : "";
      const reason = [options, price?.note].filter(Boolean).join(" · ");
      uncertainties.add(reason ? name + " (" + reason + ")" : name);
    } else {
      addItems(tariff, price.grouped ? null : measurement);
    }
    const preparation = parseApplicationTariff(price?.preparation);
    if (preparation) preparations.set(price.preparation, preparation);
    if (price?.preparation && !preparation) uncertainties.add("Пробоподготовка для «" + name + "»");
  }
  for (const preparation of preparations.values()) addItems(preparation);

  const labels = [...sections].sort(([left], [right]) => left - right).map(([section, items]) => {
    const points = [...items].map(([item, measurements]) =>
      measurements.size > 1 ? item + "*" + measurements.size : item);
    return "р. " + applicationRoman(section) + ", п. " + points.join(", ");
  });
  return { labels, uncertainties: [...uncertainties] };
}

const applicationSamples = [];
const applicationDialog = document.querySelector("#application-dialog");
const applicationEditor = document.querySelector("#application-editor");
const applicationOverview = document.querySelector("#application-overview");
const applicationTrigger = document.querySelector("#open-application");
let applicationEdit;

function openApplicationSample(category, sample = null) {
  applicationEdit = { category, sample };
  const workplace = category.catalogSubgroup === "workplace";
  applicationEditor.querySelector("#application-name-label").textContent =
    workplace ? "Название измерений" : "Рабочее название пробы";
  applicationEditor.querySelector('button[type="submit"]').textContent =
    workplace ? "Сохранить измерения" : "Сохранить пробу";
  applicationEditor.elements.quantity.placeholder =
    workplace ? "Число точек или рабочих мест и периодичность" : "Например, 1 образец 2 раза в год";
  applicationEditor.elements.sampleName.value = sample?.name ?? category.title;
  applicationEditor.elements.quantity.value = sample?.quantity ?? "";
  applicationEditor.querySelector("#application-category").textContent =
    [category.code, category.title].filter(Boolean).join(" · ");
  applicationEditor.querySelector("#application-editor-status").textContent = "";

  const groups = new Map();
  for (const [index, indicator] of category.indicators.entries()) {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "study";
    checkbox.value = String(index);
    checkbox.checked = sample?.indicators.includes(indicator) ?? workplace;
    label.append(checkbox, document.createTextNode(indicator.name));
    const note = indicator.price?.note;
    if (note) {
      const description = document.createElement("small");
      description.textContent = note;
      label.append(description);
    }
    const group = groups.get(indicator.type) ?? [];
    group.push(label);
    groups.set(indicator.type, group);
  }

  const studies = [...groups].map(([type, labels]) => {
    const group = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = studyLabels[type] ?? type;
    group.append(legend, ...labels);
    return group;
  });
  applicationEditor.querySelector("#application-studies").replaceChildren(...studies);
  applicationOverview.hidden = true;
  applicationEditor.hidden = false;
  if (!applicationDialog.open) applicationDialog.showModal();
  applicationEditor.elements.sampleName.focus();
  applicationDialog.scrollTop = 0;
}

function applicationRows() {
  return applicationSamples.map((sample, index) => {
    const { labels, uncertainties } = applicationTariffs(sample.indicators);
    const name = sample.name + (labels.length ? " (" + labels.join(", ") + ")" : "");
    return { number: index + 1, name, quantity: sample.quantity, uncertainties };
  });
}

function showApplicationOverview() {
  applicationEdit = undefined;
  applicationEditor.hidden = true;
  applicationOverview.hidden = false;
  if (!applicationDialog.open) applicationDialog.showModal();

  const rows = applicationRows();
  applicationTrigger.textContent = rows.length ? "Перечень для заявления (" + rows.length + ")" : "Перечень для заявления";
  applicationOverview.querySelector("#application-empty").hidden = Boolean(rows.length);
  applicationOverview.querySelector("#application-preview").hidden = !rows.length;
  applicationOverview.querySelector("#application-warning").hidden = !rows.some(row => row.uncertainties.length);
  applicationOverview.querySelector("#application-copy-status").textContent = "";
  applicationOverview.querySelector("#application-copy-fallback").hidden = true;

  const entries = rows.map(({ number, name, quantity, uncertainties }, index) => {
    const sample = applicationSamples[index];
    const row = document.createElement("tr");
    row.insertCell().textContent = number;
    const nameCell = row.insertCell();
    nameCell.textContent = name;
    if (uncertainties.length) {
      const note = document.createElement("small");
      note.className = "application-warning";
      note.textContent = "Уточнить пункты: " + uncertainties.join("; ");
      nameCell.append(note);
    }
    row.insertCell().textContent = quantity;
    const actions = row.insertCell();
    const edit = document.createElement("button");
    const remove = document.createElement("button");
    edit.type = remove.type = "button";
    edit.textContent = "Изменить";
    remove.textContent = "Удалить";
    const item = sample.category.catalogSubgroup === "workplace" ? "измерение" : "пробу";
    edit.setAttribute("aria-label", "Изменить " + item + " " + number);
    remove.setAttribute("aria-label", "Удалить " + item + " " + number);
    edit.addEventListener("click", () => openApplicationSample(sample.category, sample));
    remove.addEventListener("click", () => {
      applicationSamples.splice(index, 1);
      showApplicationOverview();
    });
    actions.append(edit, remove);
    return row;
  });
  applicationOverview.querySelector("tbody").replaceChildren(...entries);
  applicationDialog.querySelector(".application-heading button").focus();
  applicationDialog.scrollTop = 0;
}

async function writeApplicationClipboard(cells, text) {
  if (typeof ClipboardItem === "function" && navigator.clipboard?.write) {
    const table = document.createElement("table");
    const body = table.createTBody();
    for (const cellsInRow of cells) {
      const row = body.insertRow();
      for (const value of cellsInRow) row.insertCell().textContent = value;
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([table.outerHTML], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" })
      })]);
      return;
    } catch {
      // Try plain text if the browser blocks formatted clipboard access.
    }
  }
  await navigator.clipboard.writeText(text);
}

function setupApplication() {
  applicationTrigger.hidden = false;
  applicationTrigger.addEventListener("click", showApplicationOverview);
  document.querySelector("#cancel-application-edit").addEventListener("click", showApplicationOverview);
  applicationEditor.addEventListener("submit", event => {
    event.preventDefault();
    const { category, sample } = applicationEdit;
    const fields = new FormData(applicationEditor);
    const name = fields.get("sampleName").trim();
    const quantity = fields.get("quantity").trim();
    const indicators = fields.getAll("study").map(index => category.indicators[index]);
    const status = applicationEditor.querySelector("#application-editor-status");
    if (!name || !quantity || !indicators.length) {
      status.textContent = "Укажите название и количество и выберите хотя бы одно исследование.";
      return;
    }
    const entry = { category, name, quantity, indicators };
    if (sample) Object.assign(sample, entry);
    else applicationSamples.push(entry);
    showApplicationOverview();
  });
  document.querySelector("#copy-application").addEventListener("click", async () => {
    const rows = applicationRows().map(({ number, name, quantity, uncertainties }) => [
      number,
      uncertainties.length ? name + " [Черновик — уточнить пункты: " + uncertainties.join("; ") + "]" : name,
      quantity
    ]);
    const cells = rows.map(row => row.map(cell => String(cell).replace(/[\t\r\n]+/g, " ")));
    const value = cells.map(row => row.join("\t")).join("\n");
    const fallback = applicationOverview.querySelector("#application-copy-fallback");
    const status = applicationOverview.querySelector("#application-copy-status");
    try {
      await writeApplicationClipboard(cells, value);
      fallback.hidden = true;
      status.textContent = "Перечень скопирован.";
    } catch {
      const textarea = fallback.querySelector("textarea");
      textarea.value = value;
      fallback.hidden = false;
      textarea.focus();
      textarea.select();
      status.textContent = "Текст выделен для ручного копирования.";
    }
  });
}
