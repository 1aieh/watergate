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

  function setBadgeContent(badgeEl, { waterMl, isUnavailable }) {
    if (!badgeEl) return;

    // Clear existing contents (safe; we use data attributes for state).
    badgeEl.textContent = "";

    if (isUnavailable || typeof waterMl !== "number" || !Number.isFinite(waterMl)) {
      const span = document.createElement("span");
      span.className = "water-badge-unavailable";
      span.textContent = "Water estimate unavailable";
      badgeEl.appendChild(span);
      return;
    }

    const prefix = document.createElement("span");
    prefix.className = "water-badge-prefix";
    prefix.textContent = "This response used ";

    const amount = document.createElement("span");
    amount.className = "water-badge-amount";
    amount.textContent = `~${waterMl.toFixed(2)} mL of water`;

    badgeEl.appendChild(prefix);
    badgeEl.appendChild(amount);
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
    // Prefer a badge inside the host container.
    // (On some sites, streaming can temporarily change the preferred anchor element;
    // anchoring to the host container prevents duplicates.)
    const existingInHost = hostEl.querySelector(`.water-badge[data-water-key="${safeKey}"]`);
    const existingAnywhere = document.querySelector(`.water-badge[data-water-key="${safeKey}"]`);
    const existing = existingInHost || existingAnywhere;

    if (existing) {
      setBadgeContent(existing, { waterMl, isUnavailable });
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

      // Ensure the badge lives inside the host container and appears at the bottom.
      if (existing.parentElement !== hostEl) {
        try {
          hostEl.appendChild(existing);
        } catch (_) {
          // ignore
        }
      } else {
        // Move to end to keep it at the bottom of the response block.
        try {
          hostEl.appendChild(existing);
        } catch (_) {
          // ignore
        }
      }

      // Remove any duplicate badges with the same key elsewhere (can happen during streaming).
      const dupes = document.querySelectorAll(`.water-badge[data-water-key="${safeKey}"]`);
      if (dupes && dupes.length > 1) {
        for (const el of dupes) {
          if (el === existing) continue;
          try {
            el.remove();
          } catch (_) {
            // ignore
          }
        }
      }
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

    setBadgeContent(badge, { waterMl, isUnavailable });

    // Always anchor to the host container and keep it at the bottom.
    hostEl.appendChild(badge);

    // Direct event handlers (more reliable than delegation on heavily scripted pages).
    badge.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPopoverForBadge(badge);
    });
    badge.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      e.stopPropagation();
      openPopoverForBadge(badge);
    });
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

  function getLatestBadgeSnapshot() {
    const badges = document.querySelectorAll(".water-badge[data-water-badge='true']");
    if (!badges || !badges.length) return null;
    const last = badges[badges.length - 1];

    const modelId = last.getAttribute("data-model-id") || null;
    const model = WM?.MODEL_REGISTRY && modelId ? WM.MODEL_REGISTRY[modelId] : null;

    const wordCount = Number(last.getAttribute("data-word-count"));
    const waterMl = Number(last.getAttribute("data-water-ml"));
    const mlPer100Words = Number(last.getAttribute("data-ml-per-100-words"));

    return {
      modelId,
      modelDisplayName: model?.displayName || last.getAttribute("data-model-name") || null,
      provider: model?.provider || last.getAttribute("data-model-provider") || null,
      wordCount: Number.isFinite(wordCount) ? wordCount : null,
      waterMl: Number.isFinite(waterMl) ? waterMl : null,
      mlPer100Words: Number.isFinite(mlPer100Words) ? mlPer100Words : null
    };
  }

  // Allow the extension popup to request the latest on-page estimate.
  if (typeof chrome !== "undefined" && chrome?.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== "WATERGATE_GET_LATEST") return;
      const snap = getLatestBadgeSnapshot();
      sendResponse({
        ok: true,
        hostname: window.location.hostname,
        adapter: adapter?.name || null,
        latest: snap
      });
      return true;
    });
  }

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

  function fmtMlPer100(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return "—";
    return `${v.toFixed(2)} mL / 100 words`;
  }

  function fmtWaterMl(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return "—";
    return `~${v.toFixed(2)} mL`;
  }

  function toFiniteNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === "string") node.textContent = text;
    return node;
  }

  function buildDetailsLines(model) {
    if (!model) return [];
    const lines = [];
    if (model.basis) lines.push({ label: "Basis", value: model.basis });
    if (model.originalMetric) lines.push({ label: "Original metric", value: model.originalMetric });
    if (model.normalization) lines.push({ label: "Normalization", value: model.normalization });
    if (typeof model.mlPer100Words === "number" && Number.isFinite(model.mlPer100Words)) {
      lines.push({ label: "Value used", value: fmtMlPer100(model.mlPer100Words) });
    }
    if (model.valueRationale) lines.push({ label: "Why this value", value: model.valueRationale });
    return lines;
  }

  function buildAssumptionsText(model) {
    if (!model) return null;
    const parts = [];
    if (Array.isArray(model.assumptions) && model.assumptions.length) {
      parts.push(...model.assumptions.map((a) => `- ${a}`));
    }
    if (model.note) parts.push(`Note: ${model.note}`);
    return parts.length ? parts.join("\n") : null;
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

    const wordCount = toFiniteNumber(badgeEl.getAttribute("data-word-count"));
    const waterMl = toFiniteNumber(badgeEl.getAttribute("data-water-ml"));
    const mlPer100Words = toFiniteNumber(badgeEl.getAttribute("data-ml-per-100-words"));

    const computedWaterMl =
      wordCount != null && mlPer100Words != null ? calcWaterMl(wordCount, mlPer100Words) : null;
    const displayWaterMl = computedWaterMl ?? waterMl ?? null;
    const isUnavailable = badgeEl.getAttribute("data-water-unavailable") === "true" || !model;

    const popover = document.createElement("div");
    popover.className = "water-popover";
    popover.setAttribute("data-water-popover", "true");

    const header = document.createElement("div");
    header.className = "water-popover-header";

    const headerLeft = el("div", "water-popover-header-left");

    const title = document.createElement("div");
    title.className = "water-popover-title";
    title.textContent = "Water estimate";

    const meta = el("div", "water-popover-meta");
    const modelLabel = model?.displayName
      ? `${model.displayName}${model?.provider ? ` (${model.provider})` : ""}`
      : "Unknown model";
    meta.appendChild(el("span", "water-chip", modelLabel));
    if (mlPer100Words != null) meta.appendChild(el("span", "water-chip is-accent", fmtMlPer100(mlPer100Words)));

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

    headerLeft.appendChild(title);
    headerLeft.appendChild(meta);
    header.appendChild(headerLeft);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "water-popover-body";

    // Hero
    const hero = el("div", "water-hero");
    hero.appendChild(el("div", "water-kicker", "This response used"));
    hero.appendChild(
      el("div", "water-value", isUnavailable ? "Water estimate unavailable" : fmtWaterMl(displayWaterMl))
    );

    const subParts = [];
    if (wordCount != null) subParts.push(`${wordCount.toFixed(0)} words`);
    if (mlPer100Words != null) subParts.push(`normalized at ${fmtMlPer100(mlPer100Words)}`);
    hero.appendChild(
      el(
        "div",
        "water-sub",
        subParts.length ? subParts.join(" • ") : "Generate a response to see the per-response estimate."
      )
    );
    body.appendChild(hero);

    // Key facts
    const facts = el("div", "water-facts");
    const addFact = (label, value) => {
      const row = el("div", "water-fact");
      row.appendChild(el("div", "water-fact-label", label));
      row.appendChild(el("div", "water-fact-value", value));
      facts.appendChild(row);
    };
    addFact("Site", window.location.hostname);
    addFact("Model", modelLabel);
    if (model?.basis) addFact("Estimate basis", model.basis);
    body.appendChild(facts);

    // Calculation
    const calcSection = el("div", "water-section");
    calcSection.appendChild(el("div", "water-section-title", "Calculation"));
    const calcCard = el("div", "water-card");
    const formula =
      mlPer100Words != null ? `(response word count ÷ 100) × ${mlPer100Words.toFixed(2)}` : "(response word count ÷ 100) × (mL per 100 words)";
    calcCard.appendChild(el("div", "water-mono", `Formula: ${formula}`));
    if (wordCount != null && mlPer100Words != null && displayWaterMl != null) {
      const blocks = wordCount / 100;
      calcCard.appendChild(
        el(
          "div",
          "water-mono",
          [
            `${wordCount.toFixed(0)} words ÷ 100 = ${blocks.toFixed(2)}`,
            `${blocks.toFixed(2)} × ${mlPer100Words.toFixed(2)} = ${displayWaterMl.toFixed(2)} mL`
          ].join("\n")
        )
      );
    }
    calcSection.appendChild(calcCard);
    body.appendChild(calcSection);

    // Details (progressive disclosure)
    const detailsSection = el("div", "water-section");
    detailsSection.appendChild(el("div", "water-section-title", "Details"));

    const detailsLines = buildDetailsLines(model);
    if (detailsLines.length) {
      const dl = el("div", "water-dl");
      for (const line of detailsLines) {
        const row = el("div", "water-dl-row");
        row.appendChild(el("div", "water-dt", line.label));
        row.appendChild(el("div", "water-dd", line.value));
        dl.appendChild(row);
      }
      detailsSection.appendChild(dl);
    } else {
      detailsSection.appendChild(el("div", "water-muted", "Open a supported chat page to see model-specific details."));
    }

    const assumptionsText = buildAssumptionsText(model);
    if (assumptionsText) {
      const details = document.createElement("details");
      details.className = "water-details";
      const summary = document.createElement("summary");
      summary.textContent = "Assumptions & notes";
      const pre = el("pre", "water-pre", assumptionsText);
      details.appendChild(summary);
      details.appendChild(pre);
      detailsSection.appendChild(details);
    }

    if (model?.explanationText) {
      const details = document.createElement("details");
      details.className = "water-details";
      const summary = document.createElement("summary");
      summary.textContent = "Full model breakdown";
      const pre = el("pre", "water-pre", model.explanationText);
      details.appendChild(summary);
      details.appendChild(pre);
      detailsSection.appendChild(details);
    }

    const footer = el("div", "water-footnote", "Reflective system, not a guilt meter.");
    detailsSection.appendChild(footer);

    body.appendChild(detailsSection);

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
