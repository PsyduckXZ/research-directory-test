import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderFallback } from "./render-fallback.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFile(resolve(root, path), "utf8");
const stringify = value => JSON.stringify(value).replaceAll("<", "\\u003c");
const check = process.argv.includes("--check");
const pwa = process.argv.includes("--pwa");
const web = process.argv.includes("--web");
const releaseArg = process.argv.find(arg => arg.startsWith("--release="));
const version = releaseArg?.slice("--release=".length);
assert(!releaseArg || /^\d+\.\d+(?:\.\d+)?(?:-test)?$/.test(version), "Неверный номер релиза");
const versionParts = version?.split("-")[0].split(".") ?? [];
if (versionParts.length === 2) versionParts.push("0");
const releaseNumber = versionParts.reduce((number, part) => {
  assert(Number(part) < 1000, "Компонент версии должен быть меньше 1000");
  return number * 1000 + Number(part);
}, 0);
assert(!web || (!pwa && version), "Веб-сборка требует номер релиза и отдельна от PWA");
const migrate = process.argv.includes("--migrate");
assert(!migrate || (pwa && version), "Миграция требует PWA с номером релиза");
const output = resolve(root, process.argv.slice(2).find(arg => !arg.startsWith("--")) ??
  (pwa ? "dist/pwa/index.html" : web ? "dist/web/index.html" : version ? "dist/windows/index.html" : "dist/research-directory-sampling-trial.html"));
assert(!(pwa || web) || basename(output) === "index.html", "Укажите путь к index.html");
const template = await read("src/index.template.html");
const app = await read("src/app.js");
const styles = await read("src/styles.css");
const labels = JSON.parse(await read("data/labels.json"));
const catalogDir = resolve(root, "data/categories");
const entries = (await readdir(catalogDir)).filter(name => name.endsWith(".json")).sort();
assert(entries.length, "Нет файлов каталога");
const categories = [];
const cardsByFile = new Map();
const priceRules = JSON.parse(await read("data/price-rules.json")).indicators.map(({ namePattern, price }) => ({
  name: new RegExp(namePattern, "iu"), price
}));

for (const file of entries) {
  const section = file.slice(0, -5);
  const cards = JSON.parse(await read("data/categories/" + file));
  assert(Array.isArray(cards) && cards.length, file + ": ожидается непустой массив карточек");
  cardsByFile.set(file, cards);
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
      const priceRule = card.code && !card.code.startsWith("8.1.") && indicator.type === "Санитарно-химическое"
        ? priceRules.find(rule => rule.name.test(indicator.name))
        : undefined;
      if (priceRule && !indicator.price) indicator.price = priceRule.price;
      if (indicator.price !== undefined) {
        const price = indicator.price;
        assert(price && typeof price === "object" && !Array.isArray(price), where + ": неверный прейскурант");
        assert(typeof price.source === "string" && price.source.trim() &&
          typeof price.code === "string" && price.code.trim(), where + ": нет кода или источника прейскуранта");
        for (const field of ["note", "preparation"]) {
          assert(price[field] === undefined || typeof price[field] === "string", where + ": неверное поле " + field);
        }
        assert(price.grouped === undefined || typeof price.grouped === "boolean", where + ": неверное поле grouped");
      }
    }
    categories.push(card);
  }
}

const identities = categories.map(({ code, title }) => JSON.stringify([code, title]));
assert.equal(new Set(identities).size, categories.length, "Повторяется сочетание кода и названия карточки");
const labelScript = "const groupTitles = " + stringify(labels.groupTitles) + ";\nconst studyLabels = " + stringify(labels.studyLabels) + ";\nconst preparationLabels = " + stringify(labels.preparationLabels) + ";";
const catalogFiles = entries.map(name => "data/" + name);
const offlineStatus = pwa ? '<p id="offline-status" class="offline-status" role="status">Готовим каталог для работы без интернета…</p>' : "";
const updateControls = version ? `<div class="update-panel">
      <p id="update-status" role="status"></p>
      ${pwa
        ? '<button type="button" id="apply-update" hidden>Применить обновление</button>'
        : web ? "" : '<button type="button" id="download-update" hidden>Загрузить обновление</button><a id="save-update" hidden>Сохранить новый HTML</a>'}
    </div>` : "";
const webUpdateScript = web ? await read("src/web-update.js") : "";
const pwaUpdateScript = pwa ? await read("src/pwa/update.js") : "";
const windowsReleaseUrl = "https://psyduckxz.github.io/research-directory-test/windows/version.json";
const parts = {
  STYLES: styles,
  PWAHEAD: pwa ? [
    '  <link rel="manifest" href="manifest.webmanifest">',
    '  <link rel="apple-touch-icon" href="icon-180.png">',
    '  <meta name="theme-color" content="#183c68">'
  ].join("\n") : "",
  PWASTATUS: offlineStatus,
  UPDATEBUTTON: version ? `        <button type="button" id="check-update" class="update-button"${pwa ? " hidden" : ""}>Проверить обновления</button>` : "",
  UPDATESTATUS: updateControls,
  VERSION: version ? "Версия " + version : "Рабочая библиотека",
  FALLBACK: pwa ? "" : renderFallback(categories, labels),
  SCRIPTS: pwa
    ? `<script>${await read("src/pwa/start.js")}\n${pwaUpdateScript}\nstartDirectoryPwa(${stringify(catalogFiles)}, () => {\n${labelScript}\n${app}\n}, ${Boolean(version)});</script>`
    : `<script>window.RESEARCH_CATEGORIES = ${stringify(categories)};</script>\n<script>${web ? "(() => {\n" : ""}${labelScript}\n${app}\n${web ? `${webUpdateScript}\nsetupDesktopUpdates(${releaseNumber}, () => ({
  query: search.value,
  card: selected ? [selected.code, selected.title] : null
}), (query, card) => {
  search.value = query;
  updateQuery();
  if (!card) return;
  const row = [...results.querySelectorAll(".result")].find(row =>
    (row.querySelector(".code").textContent || null) === card[0] &&
    row.querySelector(".result-title").textContent === card[1]);
  if (!row) return;
  for (let parent = row.parentElement; parent !== results; parent = parent.parentElement) {
    if (parent.tagName === "DETAILS") parent.open = true;
  }
  row.click();
});
})();` : version ? `${await read("src/windows-update.js")}\nsetupWindowsUpdates(${releaseNumber}, "${windowsReleaseUrl}");` : ""}</script>`,
  COUNT: String(categories.length),
};
const pageTemplate = pwa
  ? template.replace(/<div id="catalog-fallback">.*?@@FALLBACK@@<\/div>/s, '<div id="catalog-fallback"></div>')
  : template;
const html = pageTemplate.replace(/@@([A-Z]+)@@/g, (_, name) => {
  assert(Object.hasOwn(parts, name), "Неизвестный маркер " + name);
  return parts[name];
});
const indicators = categories.reduce((sum, card) => sum + card.indicators.length, 0);
if (!check) {
  await mkdir(dirname(output), { recursive: true });
  if (web) {
    const payload = gzipSync(html);
    const file = "research-directory-" + version + ".html.gz";
    const manifest = { release: releaseNumber, version, file, sha256: createHash("sha256").update(payload).digest("hex") };
    const directory = dirname(output);
    const loader = await read("src/web-loader.html");
    await writeFile(output, loader.replace("@@WEBUPDATE@@", () => webUpdateScript), "utf8");
    await writeFile(resolve(directory, file), payload);
    await writeFile(resolve(directory, "version.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  } else if (!pwa && version) {
    const payload = gzipSync(html).toString("base64");
    const portable = await read("src/windows-loader.html");
    const document = portable.replace("@@PAYLOAD@@", payload);
    const filename = "research-directory-" + version + ".html";
    const manifest = {
      release: releaseNumber, version, file: filename,
      sha256: createHash("sha256").update(document).digest("hex"),
    };
    await writeFile(resolve(dirname(output), filename), document, "utf8");
    await writeFile(resolve(dirname(output), "version.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  } else {
    await writeFile(output, html, "utf8");
  }
  if (pwa) {
    const directory = dirname(output);
    const assets = ["manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];
    const files = ["index.html", ...assets, ...catalogFiles];
    const workerTemplate = await read("src/pwa/sw.template.js");
    await mkdir(resolve(directory, "data"), { recursive: true });
    for (const asset of assets) await copyFile(resolve(root, "src/pwa", asset), resolve(directory, asset));
    for (const name of entries) {
      await writeFile(resolve(directory, "data", name), JSON.stringify(cardsByFile.get(name), null, 2) + "\n", "utf8");
    }
    const hashes = Object.fromEntries(await Promise.all(files.map(async file => [
      file, createHash("sha256").update(await readFile(resolve(directory, file))).digest("hex")
    ])));
    const revision = createHash("sha256").update(workerTemplate).update(stringify(hashes)).update(String(migrate)).digest("hex");
    const worker = workerTemplate.replace("@@REVISION@@", revision)
      .replace("@@FILES@@", stringify(hashes)).replace("@@MIGRATE@@", String(migrate));
    await writeFile(resolve(directory, "sw.js"), worker, "utf8");
  }
}
const result = !pwa && !web && version ? resolve(dirname(output), "research-directory-" + version + ".html") : output;
console.log(`${categories.length} карточек, ${indicators} строк показателей. ${check ? "Проверка пройдена." : result}`);
