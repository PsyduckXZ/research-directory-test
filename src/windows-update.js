"use strict";

function setupWindowsUpdates(currentRelease, releaseUrl) {
  const check = document.querySelector("#check-update");
  const download = document.querySelector("#download-update");
  const save = document.querySelector("#save-update");
  const status = document.querySelector("#update-status");
  let release;
  let objectUrl;

  function resetDownload() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
    save.hidden = true;
    save.removeAttribute("href");
    download.hidden = true;
    release = undefined;
  }

  async function checkVersion() {
    resetDownload();
    check.disabled = true;
    status.textContent = "Проверяем обновления…";
    try {
      const response = await fetch(releaseUrl, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const latest = await response.json();
      if (!Number.isSafeInteger(latest.release) || !/^\d+\.\d+\.\d+(?:-test)?$/.test(latest.version) ||
          !/^research-directory-[\d.]+(?:-test)?\.html$/.test(latest.file) ||
          !/^[a-f0-9]{64}$/.test(latest.sha256)) {
        throw new Error("Неизвестный формат версии");
      }
      if (latest.release <= currentRelease) {
        status.textContent = "Установлена актуальная версия.";
        return;
      }
      release = latest;
      status.textContent = `Доступна версия ${latest.version}.`;
      download.hidden = false;
    } catch {
      status.textContent = "Проверка недоступна. Текущий файл можно использовать без интернета.";
    } finally {
      check.disabled = false;
    }
  }

  check.addEventListener("click", checkVersion);
  download.addEventListener("click", async () => {
    const latest = release;
    download.disabled = true;
    check.disabled = true;
    status.textContent = "Загружаем обновление…";
    try {
      const response = await fetch(new URL(latest.file, releaseUrl), { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", data);
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      if (hash !== latest.sha256) throw new Error("Контрольная сумма не совпала");
      objectUrl = URL.createObjectURL(new Blob([data], { type: "text/html;charset=utf-8" }));
      save.href = objectUrl;
      save.download = latest.file;
      save.hidden = false;
      download.hidden = true;
      status.textContent = "Новый HTML готов. Сохраните его и откройте в браузере.";
    } catch {
      status.textContent = "Загрузка прервалась или файл повреждён. Можно повторить. Текущий файл доступен.";
    } finally {
      download.disabled = false;
      check.disabled = false;
    }
  });
  checkVersion();
}
