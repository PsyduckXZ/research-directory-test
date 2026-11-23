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
  const quantity = applicationEditor.elements.quantity;
  quantity.closest("label").hidden = workplace;
  quantity.disabled = workplace;
  applicationEditor.elements.sampleName.value = sample?.name ?? category.title;
  quantity.value = workplace ? "" : sample?.quantity ?? "";
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
    checkbox.checked = sample?.indicators.includes(indicator) ?? false;
    label.append(checkbox, document.createTextNode(indicator.name));
    const note = indicator.price?.note;
    if (note) {
      const description = document.createElement("small");
      description.textContent = note;
      label.append(description);
    }
    const group = groups.get(indicator.type) ?? [];
    if (workplace) {
      const item = document.createElement("div");
      const amountField = document.createElement("div");
      const amount = document.createElement("input");
      amount.type = "text";
      amount.name = "measurement-" + index;
      amount.placeholder = "Количество и периодичность";
      amount.setAttribute("aria-label", "Количество: " + indicator.name);
      amount.value = sample?.measurementQuantities?.[index] ?? "";
      const updateAmountField = () => {
        amountField.hidden = !checkbox.checked;
        amount.disabled = !checkbox.checked;
      };
      checkbox.addEventListener("change", updateAmountField);
      updateAmountField();
      amountField.append(amount);
      item.append(label, amountField);
      group.push(item);
    } else {
      group.push(label);
    }
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
    const quantity = sample.measurementQuantities
      ? Object.entries(sample.measurementQuantities).map(([index, amount]) =>
        sample.category.indicators[index].name + ": " + amount).join("\n")
      : sample.quantity;
    return { number: index + 1, name, quantity, uncertainties };
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
    const quantityCell = row.insertCell();
    quantityCell.style.whiteSpace = "pre-line";
    quantityCell.textContent = quantity;
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
      for (const value of cellsInRow) {
        const cell = row.insertCell();
        for (const [index, line] of value.split("\n").entries()) {
          if (index) cell.append(document.createElement("br"));
          cell.append(line);
        }
      }
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
  const isBackdrop = event => {
    const { left, right, top, bottom } = applicationDialog.getBoundingClientRect();
    return event.target === applicationDialog &&
      (event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom);
  };
  let pointerStartedOnBackdrop = false;
  applicationDialog.addEventListener("pointerdown", event => {
    pointerStartedOnBackdrop = isBackdrop(event);
  });
  applicationDialog.addEventListener("click", event => {
    if (pointerStartedOnBackdrop && isBackdrop(event)) applicationDialog.close();
    pointerStartedOnBackdrop = false;
  });
  applicationEditor.addEventListener("submit", event => {
    event.preventDefault();
    const { category, sample } = applicationEdit;
    const fields = new FormData(applicationEditor);
    const name = fields.get("sampleName").trim();
    const workplace = category.catalogSubgroup === "workplace";
    const selectedIndices = fields.getAll("study");
    const indicators = selectedIndices.map(index => category.indicators[index]);
    const measurementQuantities = workplace
      ? Object.fromEntries(selectedIndices.map(index => [index, fields.get("measurement-" + index).trim()]))
      : null;
    const quantity = fields.get("quantity")?.trim() ?? "";
    const status = applicationEditor.querySelector("#application-editor-status");
    const hasQuantity = workplace ? Object.values(measurementQuantities).every(Boolean) : Boolean(quantity);
    if (!name || !hasQuantity || !indicators.length) {
      status.textContent = workplace
        ? "Выберите хотя бы одно измерение и укажите количество для каждого выбранного измерения."
        : "Укажите название и количество и выберите хотя бы одно исследование.";
      return;
    }
    const entry = { category, name, quantity, indicators, measurementQuantities };
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
    const cells = rows.map(row => row.map(cell => String(cell).replace(/[\t\r]+/g, " ")));
    const value = cells.map(row => row.map(cell => cell.replaceAll("\n", " · ")).join("\t")).join("\n");
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
