/* global chrome */

(() => {
  const WM = window.WatergateModels;
  const currentSiteEl = document.getElementById("currentSite");
  const currentModelEl = document.getElementById("currentModel");
  const currentMetaEl = document.getElementById("currentMeta");
  const currentPillEl = document.getElementById("currentPill");
  const currentCompareEl = document.getElementById("currentCompare");
  const modelListEl = document.getElementById("modelList");
  const headlineWaterEl = document.getElementById("headlineWater");
  const headlineSubEl = document.getElementById("headlineSub");
  const calcStepsEl = document.getElementById("calcSteps");
  const modelChartEl = document.getElementById("modelChart");
  const detailsBasisEl = document.getElementById("detailsBasis");
  const detailsAssumptionsEl = document.getElementById("detailsAssumptions");

  function safeText(el, text) {
    if (!el) return;
    el.textContent = text;
  }

  function formatMl(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return "—";
    return `${v.toFixed(2)} mL / 100 words`;
  }

  function formatWaterMl(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return "—";
    return `~${v.toFixed(2)} mL`;
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
      summary.textContent = "Estimate details";
      const pre = document.createElement("pre");
      pre.textContent = m.explanationText || "Water estimate unavailable.";
      details.appendChild(summary);
      details.appendChild(pre);

      row.appendChild(top);
      row.appendChild(details);
      modelListEl.appendChild(row);
    }
  }

  function renderModelChart({ wordCount, currentModelId }) {
    if (!modelChartEl) return;
    modelChartEl.innerHTML = "";

    const models = Object.values(WM.MODEL_REGISTRY || {}).slice();
    const wc = typeof wordCount === "number" && Number.isFinite(wordCount) ? wordCount : null;
    if (!models.length || wc == null) {
      const empty = document.createElement("div");
      empty.className = "muted small";
      empty.textContent = "No response detected on this page yet.";
      modelChartEl.appendChild(empty);
      return;
    }

    const rows = models
      .map((m) => {
        const w = WM.calcWaterMl ? WM.calcWaterMl(wc, m.mlPer100Words) : null;
        return { model: m, waterMl: w };
      })
      .filter((r) => typeof r.waterMl === "number" && Number.isFinite(r.waterMl));

    const max = Math.max(...rows.map((r) => r.waterMl));
    for (const r of rows) {
      const row = document.createElement("div");
      row.className = "chart-row";
      if (r.model.id === currentModelId) row.classList.add("is-current");

      const name = document.createElement("div");
      name.className = "chart-name";
      name.textContent = r.model.displayName || r.model.id;

      const bar = document.createElement("div");
      bar.className = "chart-bar";
      const fill = document.createElement("span");
      const pct = max > 0 ? Math.max(0.03, r.waterMl / max) * 100 : 0;
      fill.style.width = `${Math.min(100, pct).toFixed(1)}%`;
      bar.appendChild(fill);

      const value = document.createElement("div");
      value.className = "chart-value";
      value.textContent = `~${r.waterMl.toFixed(2)} mL`;

      row.appendChild(name);
      row.appendChild(bar);
      row.appendChild(value);
      modelChartEl.appendChild(row);
    }
  }

  function renderDetails({ model }) {
    if (!model) {
      safeText(detailsBasisEl, "Open an AI chat page to see model-specific details.");
      safeText(detailsAssumptionsEl, "—");
      return;
    }

    const basisLines = [];
    if (model.basis) basisLines.push(`Basis: ${model.basis}`);
    if (model.originalMetric) basisLines.push(`Original metric: ${model.originalMetric}`);
    if (model.normalization) basisLines.push(`Normalization: ${model.normalization}`);
    if (typeof model.mlPer100Words === "number" && Number.isFinite(model.mlPer100Words)) {
      basisLines.push(`Value used: ${model.mlPer100Words.toFixed(2)} mL / 100 words`);
    }
    safeText(detailsBasisEl, basisLines.filter(Boolean).join("\n") || "—");

    const assumptionsLines = [];
    if (Array.isArray(model.assumptions) && model.assumptions.length) {
      assumptionsLines.push("Assumptions:");
      for (const a of model.assumptions) assumptionsLines.push(`- ${a}`);
    }
    if (model.note) assumptionsLines.push(`Note: ${model.note}`);
    safeText(detailsAssumptionsEl, assumptionsLines.filter(Boolean).join("\n") || "No additional assumptions listed.");
  }

  function renderCurrent({
    hostname,
    modelId,
    latestWordCount,
    latestWaterMl,
    latestMlPer100Words
  }) {
    const model = modelId ? WM.MODEL_REGISTRY[modelId] : null;

    safeText(currentSiteEl, hostname ? hostname : "Unsupported / unknown site");
    safeText(
      currentModelEl,
      model ? `${model.displayName || model.id} (${model.provider || "Unknown provider"})` : "No mapped model"
    );
    safeText(currentMetaEl, model ? model.basis || "" : "");
    safeText(currentPillEl, model ? formatMl(model.mlPer100Words) : "—");

    const wc = typeof latestWordCount === "number" && Number.isFinite(latestWordCount) ? latestWordCount : null;
    const ml = typeof latestWaterMl === "number" && Number.isFinite(latestWaterMl) ? latestWaterMl : null;
    const m = typeof latestMlPer100Words === "number" && Number.isFinite(latestMlPer100Words) ? latestMlPer100Words : null;

    safeText(headlineWaterEl, ml != null ? formatWaterMl(ml) : "—");
    safeText(headlineSubEl, wc != null ? `${wc.toFixed(0)} words • normalized at ${m != null ? `${m.toFixed(2)} mL / 100 words` : "—"}` : "No response detected yet.");

    if (wc != null && m != null && ml != null) {
      const blocks = wc / 100;
      safeText(
        calcStepsEl,
        [
          `${wc.toFixed(0)} words ÷ 100 words = ${blocks.toFixed(2)} (hundreds of words)`,
          `${blocks.toFixed(2)} × ${m.toFixed(2)} (mL per 100 words) = ${ml.toFixed(2)} mL`
        ].join("\n")
      );
    } else {
      safeText(calcStepsEl, "Open a chat page and generate a response to see the per-response calculation.");
    }

    const allValues = Object.values(WM.MODEL_REGISTRY || {}).map((m2) => m2.mlPer100Words);
    const avg = mean(allValues);
    if (!model || avg == null) {
      safeText(currentCompareEl, "");
    } else {
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

    renderModelChart({ wordCount: wc, currentModelId: modelId });
    renderDetails({ model });
  }

  function getHostnameFromUrl(url) {
    try {
      return new URL(url).hostname;
    } catch (_) {
      return null;
    }
  }

  async function getLatestFromPage(tabId) {
    try {
      const resp = await chrome.tabs.sendMessage(tabId, { type: "WATERGATE_GET_LATEST" });
      if (!resp || resp.ok !== true) return null;
      return resp;
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

    const latest = tab?.id ? await getLatestFromPage(tab.id) : null;
    const latestWordCount = latest?.latest?.wordCount ?? null;
    const latestWaterMl = latest?.latest?.waterMl ?? null;
    const latestMlPer100Words = latest?.latest?.mlPer100Words ?? (modelId ? WM.MODEL_REGISTRY[modelId]?.mlPer100Words : null);

    renderCurrent({
      hostname,
      modelId,
      latestWordCount,
      latestWaterMl,
      latestMlPer100Words
    });
    renderModelList({ currentModelId: modelId });
  }

  init().catch((err) => {
    safeText(currentSiteEl, `Error: ${String(err?.message || err)}`);
  });
})();

