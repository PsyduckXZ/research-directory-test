"use strict";

const desktopManifest = new URL("version.json", location.href);
const desktopStateKey = "research-directory:desktop:" + location.pathname;

async function fetchDesktopRelease(manifest = desktopManifest) {
  const response = await fetch(manifest, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Не удалось получить номер версии");
  const release = await response.json();
  if (!Number.isSafeInteger(release.release) || release.release < 1 ||
      !/^\d+\.\d+\.\d+(?:-test)?$/.test(release.version) ||
      release.file !== `research-directory-${release.version}.html.gz` ||
      !/^[a-f0-9]{64}$/.test(release.sha256)) {
    throw new Error("Неверное описание версии");
  }
  return release;
}

async function loadDesktopPage(release) {
  const response = await fetch(new URL(release.file, desktopManifest), { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error("Не удалось загрузить справочник");
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  if (hash !== release.sha256) throw new Error("Контрольная сумма не совпала");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function showDesktopPage(html) {
  document.open();
  document.write(html);
  document.close();
}

function setupDesktopUpdates(currentRelease, getState, restoreState) {
  const button = document.querySelector("#check-update");
  const status = document.querySelector("#update-status");
  try {
    const saved = sessionStorage.getItem(desktopStateKey);
    if (saved) {
      sessionStorage.removeItem(desktopStateKey);
      const { query, card, version } = JSON.parse(saved);
      restoreState(query, card);
      status.textContent = `Обновлено до версии ${version}.`;
    }
  } catch {
    // The catalog remains usable when the browser blocks session storage.
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "Проверяем обновления…";
    let html;
    let version;
    try {
      const release = await fetchDesktopRelease();
      if (release.release <= currentRelease) {
        status.textContent = "Установлена актуальная версия.";
        return;
      }
      status.textContent = `Загружаем версию ${release.version}…`;
      html = await loadDesktopPage(release);
      version = release.version;
    } catch {
      status.textContent = "Обновление не загрузилось. Открытый справочник доступен. Попробуйте ещё раз.";
      return;
    } finally {
      button.disabled = false;
    }

    try {
      sessionStorage.setItem(desktopStateKey, JSON.stringify({ ...getState(), version }));
    } catch {
      // Updating is still possible without restoring the search state.
    }
    showDesktopPage(html);
  });
}
