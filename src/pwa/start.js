"use strict";

async function startDirectoryPwa(catalogFiles, renderDirectory, updates) {
  const status = document.querySelector("#offline-status");
  try {
    const sections = await Promise.all(catalogFiles.map(async path => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
      return response.json();
    }));
    window.RESEARCH_CATEGORIES = sections.flat();
    renderDirectory();
  } catch (error) {
    status.textContent = "Каталог не загрузился. Откройте страницу с интернетом и обновите её.";
    console.error(error);
    return;
  }

  if (updates) {
    setupPwaUpdates(status);
  } else if (navigator.serviceWorker) {
    try {
      await navigator.serviceWorker.register("./sw.js");
      await navigator.serviceWorker.ready;
      status.textContent = "Справочник готов к работе без интернета.";
    } catch {
      status.textContent = "Не удалось настроить офлайн-доступ. Обновите страницу.";
    }
  } else {
    status.textContent = "Офлайн-доступ недоступен в этом браузере.";
  }
}
