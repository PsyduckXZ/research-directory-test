const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" };
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => entities[char]);

function samplingText(indicator, category) {
  const sampling = indicator.sampling.trim() ||
    (indicator.type === "Микробиологическое" ? category.sampling?.trim() : "") || "";
  return sampling;
}

function renderIndicator(indicator) {
  const { name, limit, price } = indicator;
  const priceHtml = price ? '<br><span class="fallback-price" title="' + escape([price.note, price.preparation && "Пробоподготовка " + price.preparation].filter(Boolean).join(" · ")) +
    '">Прейскурант · ' + escape(price.code) + "</span>" : "";
  return "<li><strong>" + escape(name) + "</strong><br>" + escape(limit) + priceHtml + "</li>";
}

function renderStudy(type, indicators, category, studyLabels) {
  const byReference = new Map();
  for (const indicator of indicators) {
    const basis = indicator.basis.trim();
    const sampling = samplingText(indicator, category);
    const key = JSON.stringify([basis, sampling]);
    if (!byReference.has(key)) byReference.set(key, []);
    byReference.get(key).push(indicator);
  }
  const references = [...byReference].map(([key, rows]) => {
    const [basis, sampling] = JSON.parse(key);
    return '<div class="fallback-reference"><p><strong>Основание</strong> ' +
      escape(basis || "Нет данных") + "</p><p><strong>Отбор проб</strong> " +
      escape(sampling || "Нет данных") + "</p><ul>" + rows.map(renderIndicator).join("") + "</ul></div>";
  }).join("");
  const preparations = new Set(indicators.map(indicator => indicator.price?.preparation).filter(Boolean));
  const preparationHtml = [...preparations].map(preparation => '<p class="study-preparation">Пробоподготовка · ' +
    escape(preparation) + "</p>").join("");
  const priceNotes = new Set(indicators.filter(({ price }) => price?.code === "Уточнить" || price?.code === "р. 8, п. 50")
    .map(({ price }) => price.note).filter(Boolean));
  const priceNotesHtml = [...priceNotes].map(note => '<p class="study-preparation">' + escape(note) + "</p>").join("");
  return '<details class="fallback-study"><summary>' + escape(studyLabels[type]) + "</summary>" +
    references + preparationHtml + priceNotesHtml + "</details>";
}

function renderCard(card, studyLabels) {
  const badge = card.code ? '<span class="code">' + escape(card.code) + "</span> " : "";
  const groups = new Map();
  for (const indicator of card.indicators) {
    if (!groups.has(indicator.type)) groups.set(indicator.type, []);
    groups.get(indicator.type).push(indicator);
  }
  const studies = [...groups].map(([type, rows]) => renderStudy(type, rows, card, studyLabels)).join("") ||
    "<p>Показатели пока не внесены.</p>";
  return '<details class="catalog-branch"><summary>' + badge + escape(card.title) +
    '</summary><div class="fallback-card"><p><strong>Условия применения</strong> ' +
    escape(card.conditions) + "</p>" + studies + "</div></details>";
}

export function renderFallback(categories, { groupTitles, studyLabels }) {
  const paths = categories.map(({ code }) => {
    const parts = code?.split(".") ?? [];
    return parts.map((_, index) => parts.slice(0, index + 1).join("."));
  });
  const branchCodes = new Set([...Object.keys(groupTitles), ...paths.flatMap(path => path.slice(0, -1))]);
  const tree = [];
  const branches = new Map();

  for (const [index, card] of categories.entries()) {
    const path = paths[index];
    const parentPath = branchCodes.has(path.at(-1)) ? [...path] : path.slice(0, -1);
    if (card.catalogSubgroup) parentPath.push(card.catalogSubgroup);
    if (!path.length) parentPath.push("water");
    let children = tree;
    for (const code of parentPath) {
      if (!branches.has(code)) {
        const node = { code, children: [] };
        children.push(node);
        branches.set(code, node);
      }
      children = branches.get(code).children;
    }
    children.push({ card });
  }

  function renderNode(node) {
    if (node.card) return renderCard(node.card, studyLabels);
    const label = node.code === "water" ? "Питьевая вода" :
      '<span class="code">' + escape(node.code.split("/")[0]) + "</span>" +
      (groupTitles[node.code] ? " " + escape(groupTitles[node.code]) : "");
    return '<details class="catalog-branch"><summary>' + label + '</summary><div class="catalog-children">' +
      node.children.map(renderNode).join("") + "</div></details>";
  }
  return '<div class="catalog-tree">' + tree.map(renderNode).join("") + "</div>";
}
