"use strict";

async function setupPwaUpdates(status) {
  const check = document.querySelector("#check-update");
  const apply = document.querySelector("#apply-update");
  const feedback = document.querySelector("#update-status");
  const serviceWorker = navigator.serviceWorker;

  if (!serviceWorker) {
    status.textContent = "Офлайн-доступ недоступен в этом браузере.";
    return;
  }

  let hadController = Boolean(serviceWorker.controller);
  function showOfflineReady() {
    if (hadController) {
      location.reload();
      return;
    }
    hadController = true;
    status.textContent = "Справочник готов к работе без интернета.";
  }
  serviceWorker.addEventListener("controllerchange", showOfflineReady);

  try {
    const registration = await serviceWorker.register("./sw.js", { updateViaCache: "none" });
    if (serviceWorker.controller) status.textContent = "Справочник готов к работе без интернета.";

    function showWaiting() {
      if (!serviceWorker.controller || !registration.waiting) return false;
      feedback.textContent = "Обновление загружено. Можно применить его и без интернета.";
      apply.hidden = false;
      check.disabled = false;
      return true;
    }

    const observed = new WeakSet();
    function watch(worker) {
      if (!worker || observed.has(worker)) return;
      observed.add(worker);
      const showState = () => {
        if (worker.state === "installing") {
          feedback.textContent = "Загружаем обновление…";
          check.disabled = true;
        } else if (worker.state === "installed") {
          if (!showWaiting()) check.disabled = false;
        } else if (worker.state === "redundant" && !showWaiting()) {
          feedback.textContent = "Загрузка прервалась. Можно повторить проверку.";
          check.disabled = false;
        }
      };
      worker.addEventListener("statechange", showState);
      showState();
    }

    async function checkVersion() {
      if (showWaiting()) return;
      if (registration.installing) {
        watch(registration.installing);
        return;
      }
      check.disabled = true;
      feedback.textContent = "Проверяем обновления…";
      try {
        await registration.update();
        if (showWaiting()) return;
        if (registration.installing) {
          watch(registration.installing);
          return;
        }
        if (feedback.textContent === "Проверяем обновления…") {
          feedback.textContent = "Установлена актуальная версия.";
        }
      } catch {
        feedback.textContent = "Проверка недоступна. Текущая версия доступна.";
      } finally {
        if (!registration.installing) check.disabled = false;
      }
    }

    check.hidden = false;
    check.addEventListener("click", checkVersion);
    apply.addEventListener("click", () => {
      const worker = registration.waiting;
      if (!worker) {
        apply.hidden = true;
        checkVersion();
        return;
      }
      apply.disabled = true;
      feedback.textContent = "Применяем обновление…";
      worker.postMessage("APPLY_UPDATE");
    });
    registration.addEventListener("updatefound", () => watch(registration.installing));
    if (!showWaiting()) {
      if (registration.installing) watch(registration.installing);
      else if (serviceWorker.controller) checkVersion();
    }
  } catch {
    if (!serviceWorker.controller) status.textContent = "Не удалось настроить офлайн-доступ. Обновите страницу.";
    feedback.textContent = "Проверка обновлений недоступна.";
  }
}
