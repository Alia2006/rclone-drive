//! Runtime i18n support (zh-CN / zh-TW / en) backed by a static JSON catalogue.
//!
//! The catalogue lives at `src-tauri/i18n/messages.json` and is embedded at
//! compile time. Structure:
//!
//! ```json
//! { "key.name": { "zh-CN": "...", "zh-TW": "...", "en": "..." } }
//! ```

use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};

/// Embedded translation catalogue.
const MESSAGES_JSON: &str = include_str!("../i18n/messages.json");

/// Fallback language used when a key/lang is missing.
const FALLBACK: &str = "zh-CN";

type MessageMap = HashMap<String, HashMap<String, String>>;

fn catalogue() -> &'static MessageMap {
    static CATALOGUE: OnceLock<MessageMap> = OnceLock::new();
    CATALOGUE.get_or_init(|| serde_json::from_str(MESSAGES_JSON).unwrap_or_default())
}

fn lang_lock() -> &'static RwLock<String> {
    static LANG: OnceLock<RwLock<String>> = OnceLock::new();
    LANG.get_or_init(|| RwLock::new(FALLBACK.to_string()))
}

/// Normalize any language tag to one of the supported languages.
///
/// `zh-TW` / `zh-HK` / `zh-MO` / `zh-Hant*` -> `zh-TW`; any other `zh*` -> `zh-CN`;
/// `en*` -> `en`; anything else -> `zh-CN`.
pub fn normalize(lang: &str) -> &'static str {
    let tag = lang.trim().to_lowercase().replace('_', "-");
    if tag.starts_with("en") {
        return "en";
    }
    if tag.starts_with("zh") {
        let traditional = ["hant", "tw", "hk", "mo"].iter().any(|sub| {
            let base = format!("zh-{sub}");
            tag == base || tag.starts_with(&format!("{base}-"))
        });
        if traditional {
            return "zh-TW";
        }
        return FALLBACK; // zh / zh-Hans / zh-CN / zh-SG ... -> Simplified Chinese
    }
    FALLBACK
}

/// Set the current UI language (normalized to a supported language).
pub fn set_current(lang: &str) {
    if let Ok(mut guard) = lang_lock().write() {
        *guard = normalize(lang).to_string();
    }
}

/// Get the current UI language.
pub fn current() -> String {
    lang_lock()
        .read()
        .map(|guard| guard.clone())
        .unwrap_or_else(|_| FALLBACK.to_string())
}

/// Translate `key` for an explicit language.
///
/// Falls back to zh-CN when the key/lang is missing, and finally returns the
/// key itself so problems stay visible instead of rendering empty text.
pub fn text(lang: &str, key: &str) -> String {
    let lang = normalize(lang);
    if let Some(entry) = catalogue().get(key) {
        if let Some(value) = entry.get(lang).filter(|v| !v.is_empty()) {
            return value.clone();
        }
        if let Some(value) = entry.get(FALLBACK).filter(|v| !v.is_empty()) {
            return value.clone();
        }
        if let Some((_, value)) = entry.iter().next() {
            return value.clone();
        }
    }
    key.to_string()
}

/// Translate `key` for the current language.
pub fn tr(key: &str) -> String {
    text(&current(), key)
}

/// Translate `key` for the current language and substitute `{name}` placeholders.
pub fn trf(key: &str, params: &[(&str, &str)]) -> String {
    let mut out = tr(key);
    for (name, value) in params {
        let placeholder = format!("{{{name}}}");
        if out.contains(placeholder.as_str()) {
            out = out.replace(&placeholder, value);
        }
    }
    out
}
