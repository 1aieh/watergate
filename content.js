(() => {
  const OBSERVE_TARGET = document.documentElement;
  const OBSERVE_OPTIONS = {
    childList: true,
    subtree: true,
    characterData: true
  };

  function countWords(text) {
    const t = (text || "").trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }

  function calcWaterMl(wordCount, mlPer100Words) {
    if (typeof mlPer100Words !== "number" || !Number.isFinite(mlPer100Words)) return null;
    const waterMl = (wordCount / 100) * mlPer100Words;
    return Math.round(waterMl * 100) / 100;
  }

  function extractTextWithoutBadges(rootEl) {
    if (!rootEl) return "";
    // Avoid counting our injected badge text.
    const clone = rootEl.cloneNode(true);
    clone.querySelectorAll(".water-badge").forEach((el) => el.remove());
    return clone.innerText || "";
  }

  function formatBadgeText({ waterMl, isUnavailable }) {
    if (isUnavailable) return "Water estimate unavailable (Gemini model not mapped yet)";
    if (typeof waterMl === "number" && Number.isFinite(waterMl))
      return `This response used ~${waterMl.toFixed(2)} mL of water`;
    return "Water estimate unavailable";
  }

  let generatedKeyCounter = 0;
  function ensureStableKeyForElement(el, prefix) {
    if (!el) return null;
    if (el.dataset && el.dataset.waterKey) return el.dataset.waterKey;
    const key = `${prefix}-${++generatedKeyCounter}`;
    try {
      el.dataset.waterKey = key;
    } catch (_) {
      // Ignore if dataset isn't writable for some reason; fallback to the generated key.
    }
    return key;
  }

  function escapeAttrValue(value) {
    if (typeof value !== "string") return "";
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
    return value.replace(/["\\]/g, "\\$&");
  }

  function upsertBadge({ key, hostEl, anchorEl, wordCount, waterMl, isUnavailable }) {
    if (!key || !hostEl) return;

    const safeKey = escapeAttrValue(key);
    const existing = hostEl.querySelector(`.water-badge[data-water-key="${safeKey}"]`);
    const displayText = formatBadgeText({ waterMl, isUnavailable });

    if (existing) {
      const strong = existing.querySelector("strong");
      if (strong) strong.textContent = displayText;
      else existing.textContent = displayText;
      existing.setAttribute("data-word-count", String(wordCount));
      if (typeof waterMl === "number" && Number.isFinite(waterMl))
        existing.setAttribute("data-water-ml", String(waterMl));
      else existing.removeAttribute("data-water-ml");
      existing.setAttribute("data-water-unavailable", String(Boolean(isUnavailable)));
      return;
    }

    const badge = document.createElement("div");
    badge.className = "water-badge";
    badge.setAttribute("data-water-badge", "true");
    badge.setAttribute("data-water-key", key);
    badge.setAttribute("data-word-count", String(wordCount));
    if (typeof waterMl === "number" && Number.isFinite(waterMl))
      badge.setAttribute("data-water-ml", String(waterMl));
    badge.setAttribute("data-water-unavailable", String(Boolean(isUnavailable)));

    const strong = document.createElement("strong");
    strong.textContent = displayText;
    badge.appendChild(strong);

    // Preferred: insert immediately after the anchor content node.
    if (anchorEl && anchorEl.insertAdjacentElement) {
      try {
        anchorEl.insertAdjacentElement("afterend", badge);
        return;
      } catch (_) {
        // Fall through to append.
      }
    }
    hostEl.appendChild(badge);
  }

  function getHostnameAdapter() {
    const hostname = window.location.hostname;

    // 1) ChatGPT
    if (hostname === "chatgpt.com") {
      const ML_PER_100_WORDS = 0.57;
      return {
        name: "ChatGPT",
        getItems() {
          const articles = document.querySelectorAll(
            'article[data-turn="assistant"][data-turn-id]'
          );
          const items = [];
          for (const article of articles) {
            const turnId = article.getAttribute("data-turn-id");
            if (!turnId) continue;

            const container =
              article.querySelector('div[data-message-author-role="assistant"]') || null;
            if (!container) continue;

            const md = container.querySelector(".markdown");
            items.push({
              key: `chatgpt::${turnId}`,
              hostEl: container,
              anchorEl: md || container,
              textEl: md || container,
              mlPer100Words: ML_PER_100_WORDS,
              isUnavailable: false
            });
          }
          return items;
        }
      };
    }

    // 2) Claude
    if (hostname === "claude.ai") {
      const ML_PER_100_WORDS = 1.5;
      return {
        name: "Claude",
        getItems() {
          const markdowns = document.querySelectorAll(".standard-markdown");
          const items = [];
          for (const md of markdowns) {
            // Exclude user messages.
            if (md.closest('[data-testid="user-message"]')) continue;

            const keyFromId = md.id ? `claude::${md.id}` : null;
            const key = keyFromId || ensureStableKeyForElement(md, "claude::standard-markdown");

            // Host container: keep badge with the response block.
            const hostEl = md.parentElement || md;
            items.push({
              key,
              hostEl,
              anchorEl: md,
              textEl: md,
              mlPer100Words: ML_PER_100_WORDS,
              isUnavailable: false
            });
          }
          return items;
        }
      };
    }

    // 3) Gemini
    if (hostname === "gemini.google.com") {
      return {
        name: "Gemini",
        getItems() {
          const markdowns = document.querySelectorAll(
            "structured-content-container .markdown.markdown-main-panel"
          );
          const items = [];
          for (const md of markdowns) {
            // Exclude user inputs.
            if (md.closest("user-query")) continue;

            const keyFromId = md.id ? `gemini::${md.id}` : null;
            const key = keyFromId || ensureStableKeyForElement(md, "gemini::markdown");

            const hostEl = md.parentElement || md;
            items.push({
              key,
              hostEl,
              anchorEl: md,
              textEl: md,
              mlPer100Words: null,
              isUnavailable: true
            });
          }
          return items;
        }
      };
    }

    return null;
  }

  // Prevent double-initialization if the script is injected twice.
  if (window.__waterBadgeInitialized) return;
  window.__waterBadgeInitialized = true;

  const adapter = getHostnameAdapter();
  if (!adapter) return;

  const observer = new MutationObserver(() => scheduleScan());

  function scanAndUpsert() {
    // Avoid feedback loops: our own badge inserts create DOM mutations.
    observer.disconnect();
    const items = adapter.getItems();
    for (const item of items) {
      const text = extractTextWithoutBadges(item.textEl);
      const wordCount = countWords(text);
      const waterMl = calcWaterMl(wordCount, item.mlPer100Words);
      upsertBadge({
        key: item.key,
        hostEl: item.hostEl,
        anchorEl: item.anchorEl,
        wordCount,
        waterMl,
        isUnavailable: item.isUnavailable
      });
    }
    observer.observe(OBSERVE_TARGET, OBSERVE_OPTIONS);
  }

  // MVP performance: scan on every mutation, lightly debounced.
  let scheduled = false;
  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scanAndUpsert();
    });
  }

  scanAndUpsert();

  observer.observe(OBSERVE_TARGET, OBSERVE_OPTIONS);
})();
