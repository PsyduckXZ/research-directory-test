import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderFallback } from "./render-fallback.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFile(resolve(root, path), "utf8");
const stringify = value => JSON.stringify(value).replaceAll("<", "\\u003c");
const check = process.argv.includes("--check");
const output = resolve(root, process.argv.slice(2).find(arg => arg !== "--check") ??
  "dist/research-directory-sampling-trial.html");
const template = await read("src/index.template.html");
const app = await read("src/app.js");
const styles = await read("src/styles.css");
const labels = JSON.parse(await read("data/labels.json"));
const catalogDir = resolve(root, "data/categories");
const entries = (await readdir(catalogDir)).filter(name => name.endsWith(".json")).sort();
assert(entries.length, "Нет файлов каталога");
const categories = [];

for (const file of entries) {
  const section = file.slice(0, -5);
  const cards = JSON.parse(await read("data/categories/" + file));
  assert(Array.isArray(cards) && cards.length, file + ": ожидается непустой массив карточек");
  for (const [index, card] of cards.entries()) {
    const at = file + ", карточка " + (index + 1);
    assert(card && typeof card === "object", at + ": ожидается объект");
    assert(card.code === null || (typeof card.code === "string" && /^\d+(?:\.\d+)*$/.test(card.code)), at + ": неверный код");
    assert.equal(card.code?.split(".")[0].padStart(2, "0") ?? "water", section, at + ": неверный раздел");
    assert(typeof card.title === "string" && card.title.trim(), at + ": нет названия");
    assert(Array.isArray(card.synonyms) && card.synonyms.every(v => typeof v === "string"), at + ": неверные синонимы");
    assert(typeof card.conditions === "string" && typeof card.demo === "boolean", at + ": неверные условия или признак демо");
    assert(card.sampling === null || typeof card.sampling === "string", at + ": неверный отбор проб");
    assert(card.catalogSubgroup === undefined || (typeof card.catalogSubgroup === "string" && Object.hasOwn(labels.groupTitles, card.catalogSubgroup)), at + ": неизвестная подгруппа");
    assert(Array.isArray(card.indicators), at + ": нет массива показателей");
    for (const [number, indicator] of card.indicators.entries()) {
      const where = at + ", показатель " + (number + 1);
      assert(indicator && typeof indicator === "object", where + ": ожидается объект");
      assert(Object.hasOwn(labels.studyLabels, indicator.type), where + ": неизвестный вид исследования");
      for (const field of ["name", "limit", "basis", "sampling"]) {
        assert(typeof indicator[field] === "string", where + ": неверное поле " + field);
      }
      assert(indicator.name.trim(), where + ": нет названия показателя");
      if (indicator.price !== undefined) {
        const price = indicator.price;
        assert(price && typeof price === "object" && !Array.isArray(price), where + ": неверный прейскурант");
        assert(typeof price.source === "string" && price.source.trim() &&
          typeof price.code === "string" && price.code.trim(), where + ": нет кода или источника прейскуранта");
        for (const field of ["note", "preparation"]) {
          assert(price[field] === undefined || typeof price[field] === "string", where + ": неверное поле " + field);
        }
      }
    }
    categories.push(card);
  }
}

const identities = categories.map(({ code, title }) => JSON.stringify([code, title]));
assert.equal(new Set(identities).size, categories.length, "Повторяется сочетание кода и названия карточки");
const parts = {
  STYLES: styles,
  FALLBACK: renderFallback(categories, labels),
  CATALOG: "window.RESEARCH_CATEGORIES = " + stringify(categories) + ";",
  LABELS: "const groupTitles = " + stringify(labels.groupTitles) + ";\nconst studyLabels = " + stringify(labels.studyLabels) + ";",
  APP: app,
  COUNT: String(categories.length),
};
const html = template.replace(/@@([A-Z]+)@@/g, (_, name) => {
  assert(Object.hasOwn(parts, name), "Неизвестный маркер " + name);
  return parts[name];
});
const indicators = categories.reduce((sum, card) => sum + card.indicators.length, 0);
if (!check) {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html, "utf8");
}
console.log(`${categories.length} карточек, ${indicators} строк показателей. ${check ? "Проверка пройдена." : output}`);
