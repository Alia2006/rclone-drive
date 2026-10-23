import { createApp } from "vue";
import { invoke } from "@tauri-apps/api/core";
import App from "./App.vue";
import "./style.css";
import { i18n, detectSystemLocale, normalizeLocale, setLocale } from "./i18n";

async function bootstrap() {
  let settings = null;
  try {
    settings = await invoke("get_app_settings");
  } catch {
    // Backend unavailable (e.g. plain browser preview): fall back to system locale.
  }

  const stored = normalizeLocale(localStorage.getItem("rclone_language"));
  const backend = normalizeLocale(settings?.language);
  const locale = stored || backend || detectSystemLocale();

  setLocale(locale);

  // Persist the resolved language (first launch / upgrade from settings without
  // a language) so the tray menu and window title match the UI immediately.
  if (backend !== locale) {
    try {
      await invoke("save_app_settings", {
        settings: {
          start_minimized_to_tray: settings?.start_minimized_to_tray !== false,
          language: locale,
        },
      });
    } catch {
      // Ignore: the UI still works, the setting will be saved on next change.
    }
  }

  createApp(App).use(i18n).mount("#app");
}

bootstrap();
