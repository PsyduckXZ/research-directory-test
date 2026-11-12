"use strict";

async function startDirectoryPwa(catalogFiles, renderDirectory) {
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

  if (!("serviceWorker" in navigator)) {
    status.textContent = "Офлайн-доступ недоступен в этом браузере.";
    return;
  }

  const showReady = () => {
    status.textContent = "Справочник готов к работе без интернета.";
  };

  try {
    const registration = await navigator.serviceWorker.register("./sw.js");
    if (navigator.serviceWorker.controller) {
      showReady();
      return;
    }
    navigator.serviceWorker.addEventListener("controllerchange", showReady, { once: true });
    const worker = registration.installing ?? registration.waiting;
    const checkInstall = () => {
      if (worker?.state === "redundant" && !navigator.serviceWorker.controller) {
        status.textContent = "Не удалось сохранить каталог. Проверьте интернет и обновите страницу.";
      }
    };
    worker?.addEventListener("statechange", checkInstall);
    checkInstall();
  } catch (error) {
    status.textContent = "Не удалось настроить офлайн-доступ. Обновите страницу.";
    console.error(error);
  }
}
