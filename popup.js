/* global chrome */

(() => {
  const WM = window.WatergateModels;
  const currentSiteEl = document.getElementById("currentSite");
  const currentModelEl = document.getElementById("currentModel");
  const currentMetaEl = document.getElementById("currentMeta");
  const currentPillEl = document.getElementById("currentPill");
  const currentCompareEl = document.getElementById("currentCompare");
  const modelListEl = document.getElementById("modelList");

  function safeText(el, text) {
    if (!el) return;
    el.textContent = text;
  }

  function formatMl(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return "—";
    return `${v.toFixed(2)} mL / 100 words`;
  }

  function mean(values) {
    const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  function percentDiff(a, b) {
    if (typeof a !== "number" || !Number.isFinite(a)) return null;
    if (typeof b !== "number" || !Number.isFinite(b) || b === 0) return null;
    return ((a - b) / b) * 100;
  }

  function renderModelList({ currentModelId }) {
    const models = Object.values(WM.MODEL_REGISTRY || {}).slice();
    models.sort((a, b) => (a.mlPer100Words ?? 0) - (b.mlPer100Words ?? 0));

    const min = models[0]?.mlPer100Words ?? null;
    const max = models[models.length - 1]?.mlPer100Words ?? null;

    modelListEl.innerHTML = "";

    for (const m of models) {
      const row = document.createElement("div");
      row.className = "row";

      const top = document.createElement("div");
      top.className = "row-top";

      const left = document.createElement("div");
      const name = document.createElement("div");
      name.className = "row-name";
      name.textContent = m.displayName || m.id;

      if (m.id === currentModelId) {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "Current";
        name.appendChild(tag);
      } else if (typeof m.mlPer100Words === "number" && m.mlPer100Words === min) {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "Lowest";
        name.appendChild(tag);
      } else if (typeof m.mlPer100Words === "number" && m.mlPer100Words === max) {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "Highest";
        name.appendChild(tag);
      }

      const sub = document.createElement("div");
      sub.className = "row-sub";
      sub.textContent = `${m.provider || "Unknown provider"} • ${m.basis || "Unknown basis"}`;

      left.appendChild(name);
      left.appendChild(sub);

      const right = document.createElement("div");
      right.className = "row-value";
      right.textContent = formatMl(m.mlPer100Words);

      top.appendChild(left);
      top.appendChild(right);

      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Calculation explanation";
      const pre = document.createElement("pre");
      pre.textContent = m.explanationText || "Water estimate unavailable.";
      details.appendChild(summary);
      details.appendChild(pre);

      row.appendChild(top);
      row.appendChild(details);
      modelListEl.appendChild(row);
    }
  }

  function renderCurrent({ hostname, modelId }) {
    const model = modelId ? WM.MODEL_REGISTRY[modelId] : null;

    safeText(currentSiteEl, hostname ? hostname : "Unsupported / unknown site");
    safeText(
      currentModelEl,
      model ? `${model.displayName || model.id} (${model.provider || "Unknown provider"})` : "No mapped model"
    );
    safeText(currentMetaEl, model ? model.basis || "" : "");
    safeText(currentPillEl, model ? formatMl(model.mlPer100Words) : "—");

    const allValues = Object.values(WM.MODEL_REGISTRY || {}).map((m) => m.mlPer100Words);
    const avg = mean(allValues);
    if (!model || avg == null) {
      safeText(currentCompareEl, "");
      return;
    }

    const diff = percentDiff(model.mlPer100Words, avg);
    const diffText =
      diff == null
        ? ""
        : diff >= 0
          ? `${diff.toFixed(0)}% higher than the system average`
          : `${Math.abs(diff).toFixed(0)}% lower than the system average`;

    const min = Math.min(...allValues.filter((v) => typeof v === "number" && Number.isFinite(v)));
    const max = Math.max(...allValues.filter((v) => typeof v === "number" && Number.isFinite(v)));
    const rangeText =
      Number.isFinite(min) && Number.isFinite(max)
        ? `System range: ${min.toFixed(2)}–${max.toFixed(2)} mL / 100 words`
        : "";

    safeText(currentCompareEl, [diffText, rangeText].filter(Boolean).join(" • "));
  }

  function getHostnameFromUrl(url) {
    try {
      return new URL(url).hostname;
    } catch (_) {
      return null;
    }
  }

  async function init() {
    if (!WM || !WM.MODEL_REGISTRY || !WM.SITE_DEFAULT_MODEL) {
      safeText(currentSiteEl, "Initialization error: model registry not found.");
      return;
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0] ? tabs[0] : null;
    const hostname = tab?.url ? getHostnameFromUrl(tab.url) : null;
    const modelId = hostname ? WM.SITE_DEFAULT_MODEL[hostname] : null;

    renderCurrent({ hostname, modelId });
    renderModelList({ currentModelId: modelId });
  }

  init().catch((err) => {
    safeText(currentSiteEl, `Error: ${String(err?.message || err)}`);
  });
})();

