(() => {
  const OBSERVE_TARGET = document.documentElement;
  const OBSERVE_OPTIONS = {
    childList: true,
    subtree: true,
    characterData: true
  };

  const WM = window.WatergateModels || null;

  function countWords(text) {
    const t = (text || "").trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }

  function calcWaterMl(wordCount, mlPer100Words) {
    if (WM && typeof WM.calcWaterMl === "function") return WM.calcWaterMl(wordCount, mlPer100Words);
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
    if (isUnavailable) return "Water estimate unavailable";
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

  function upsertBadge({
    key,
    hostEl,
    anchorEl,
    wordCount,
    waterMl,
    isUnavailable,
    modelId,
    modelDisplayName,
    provider,
    mlPer100Words
  }) {
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
      if (modelId) existing.setAttribute("data-model-id", String(modelId));
      if (modelDisplayName) existing.setAttribute("data-model-name", String(modelDisplayName));
      if (provider) existing.setAttribute("data-model-provider", String(provider));
      if (typeof mlPer100Words === "number" && Number.isFinite(mlPer100Words))
        existing.setAttribute("data-ml-per-100-words", String(mlPer100Words));
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
    if (modelId) badge.setAttribute("data-model-id", String(modelId));
    if (modelDisplayName) badge.setAttribute("data-model-name", String(modelDisplayName));
    if (provider) badge.setAttribute("data-model-provider", String(provider));
    if (typeof mlPer100Words === "number" && Number.isFinite(mlPer100Words))
      badge.setAttribute("data-ml-per-100-words", String(mlPer100Words));

    // Make it discoverable/clickable for the popover.
    badge.setAttribute("role", "button");
    badge.setAttribute("tabindex", "0");

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

    const model = WM && typeof WM.getModelForHostname === "function" ? WM.getModelForHostname(hostname) : null;
    const modelId = model?.id || (WM?.SITE_DEFAULT_MODEL ? WM.SITE_DEFAULT_MODEL[hostname] : null);
    const mlPer100Words = typeof model?.mlPer100Words === "number" ? model.mlPer100Words : null;
    const modelDisplayName = model?.displayName || null;
    const provider = model?.provider || null;
    const isUnavailable = !model || typeof mlPer100Words !== "number" || !Number.isFinite(mlPer100Words);

    // 1) ChatGPT
    if (hostname === "chatgpt.com") {
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
              modelId,
              modelDisplayName,
              provider,
              mlPer100Words,
              isUnavailable
            });
          }
          return items;
        }
      };
    }

    // 2) Claude
    if (hostname === "claude.ai") {
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
              modelId,
              modelDisplayName,
              provider,
              mlPer100Words,
              isUnavailable
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
              modelId,
              modelDisplayName,
              provider,
              mlPer100Words,
              isUnavailable
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

  // --- Badge popover (transparent explanation UI) ---
  let activePopover = null;
  let activePopoverForKey = null;

  function closePopover() {
    if (!activePopover) return;
    try {
      activePopover.remove();
    } catch (_) {
      // ignore
    }
    activePopover = null;
    activePopoverForKey = null;
  }

  function buildPopoverText({ model, wordCount, waterMl, mlPer100Words }) {
    const modelName = model?.displayName ? `${model.displayName}` : "Unknown model";
    const provider = model?.provider ? ` (${model.provider})` : "";
    const wc = typeof wordCount === "number" && Number.isFinite(wordCount) ? wordCount : null;
    const ml = typeof waterMl === "number" && Number.isFinite(waterMl) ? waterMl : null;
    const m = typeof mlPer100Words === "number" && Number.isFinite(mlPer100Words) ? mlPer100Words : null;

    const lines = [];
    lines.push(`You are using ${modelName}${provider}.`);
    if (model?.basis) lines.push(`This estimate is based on: ${model.basis}.`);
    lines.push("");
    lines.push("Common normalization: milliliters (mL) per ~100 words");
    if (m != null) lines.push(`Value used: ${m.toFixed(2)} mL / 100 words`);
    lines.push("Formula:");
    if (m != null) lines.push(`(response word count ÷ 100) × ${m.toFixed(2)}`);
    else lines.push("(response word count ÷ 100) × (mL per 100 words)");

    if (wc != null && m != null) {
      const computed = calcWaterMl(wc, m);
      lines.push("");
      lines.push(`This response: ${wc} words → ${(wc / 100).toFixed(2)} × ${m.toFixed(2)} = ${(computed ?? ml ?? 0).toFixed(2)} mL`);
    }

    lines.push("");
    if (model?.explanationText) {
      lines.push("Details:");
      lines.push(model.explanationText);
    } else {
      lines.push("Details: Water estimate unavailable.");
    }

    return lines.join("\n");
  }

  function positionPopover(popoverEl, anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const margin = 8;

    // Temporarily visible for measurement.
    popoverEl.style.visibility = "hidden";
    popoverEl.style.left = `${margin}px`;
    popoverEl.style.top = `${margin}px`;

    const width = popoverEl.offsetWidth || 320;
    const height = popoverEl.offsetHeight || 200;

    let left = rect.left;
    let top = rect.bottom + margin;

    if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width;
    if (left < margin) left = margin;

    if (top + height > window.innerHeight - margin) top = rect.top - margin - height;
    if (top < margin) top = margin;

    popoverEl.style.left = `${Math.round(left)}px`;
    popoverEl.style.top = `${Math.round(top)}px`;
    popoverEl.style.visibility = "visible";
  }

  function openPopoverForBadge(badgeEl) {
    if (!badgeEl) return;
    const key = badgeEl.getAttribute("data-water-key") || "";
    if (activePopover && activePopoverForKey === key) {
      closePopover();
      return;
    }

    closePopover();

    const modelId = badgeEl.getAttribute("data-model-id");
    const model = WM?.MODEL_REGISTRY ? WM.MODEL_REGISTRY[modelId] : null;

    const wordCount = Number(badgeEl.getAttribute("data-word-count"));
    const waterMl = Number(badgeEl.getAttribute("data-water-ml"));
    const mlPer100Words = Number(badgeEl.getAttribute("data-ml-per-100-words"));

    const popover = document.createElement("div");
    popover.className = "water-popover";
    popover.setAttribute("data-water-popover", "true");

    const header = document.createElement("div");
    header.className = "water-popover-header";

    const title = document.createElement("div");
    title.className = "water-popover-title";
    title.textContent = "Water estimate";

    const closeBtn = document.createElement("button");
    closeBtn.className = "water-popover-close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closePopover();
    });

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "water-popover-body";
    body.textContent = buildPopoverText({
      model,
      wordCount: Number.isFinite(wordCount) ? wordCount : null,
      waterMl: Number.isFinite(waterMl) ? waterMl : null,
      mlPer100Words: Number.isFinite(mlPer100Words) ? mlPer100Words : null
    });

    popover.appendChild(header);
    popover.appendChild(body);
    document.body.appendChild(popover);
    positionPopover(popover, badgeEl);

    activePopover = popover;
    activePopoverForKey = key;
  }

  document.addEventListener(
    "click",
    (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      // Click badge -> toggle popover
      const badge = target.closest(".water-badge[data-water-badge='true']");
      if (badge) {
        e.preventDefault();
        e.stopPropagation();
        openPopoverForBadge(badge);
        return;
      }

      // Click outside popover closes it
      if (activePopover) {
        const insidePopover = target.closest(".water-popover[data-water-popover='true']");
        if (!insidePopover) closePopover();
      }
    },
    true
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePopover();
    if (e.key !== "Enter" && e.key !== " ") return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    const badge = target.closest(".water-badge[data-water-badge='true']");
    if (!badge) return;
    e.preventDefault();
    openPopoverForBadge(badge);
  });

  window.addEventListener("resize", () => closePopover());
  window.addEventListener("scroll", () => closePopover(), true);

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
        isUnavailable: item.isUnavailable,
        modelId: item.modelId,
        modelDisplayName: item.modelDisplayName,
        provider: item.provider,
        mlPer100Words: item.mlPer100Words
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
