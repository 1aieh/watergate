(() => {
  /**
   * Watergate shared model registry
   *
   * Normalization rule used everywhere:
   *   water_mL = (word_count / 100) × mL_per_100_words
   *
   * Exposed globally for MV3 simplicity (content scripts + popup):
   *   window.WatergateModels = { MODEL_REGISTRY, SITE_DEFAULT_MODEL, ... }
   */

  const FORMULA_TEMPLATE = "(response word count ÷ 100) × {mL_per_100_words}";

  /** @type {Record<string, any>} */
  const MODEL_REGISTRY = {
    "gpt-4o-azure": {
      id: "gpt-4o-azure",
      displayName: "GPT-4o",
      provider: "Azure",
      basis: "Published per-query and per-word water usage estimates",
      originalMetric: "Per-query: ~1.95 mL per query; per-word: ~0.49–0.65 mL per 100 words",
      normalization: "Converted to milliliters per 100 words",
      mlPer100Words: 0.57,
      valueRationale: "Midpoint of the reported range 0.49–0.65 mL per 100 words",
      assumptions: ["A “typical” GPT-4o response is assumed to be ~300–400 words to align per-query and per-word figures."],
      formulaText: FORMULA_TEMPLATE.replace("{mL_per_100_words}", "0.57"),
      note: null
    },
    "claude-3-5-sonnet-aws": {
      id: "claude-3-5-sonnet-aws",
      displayName: "Claude-3.5 Sonnet",
      provider: "AWS",
      basis: "Published per-query water usage estimates",
      originalMetric: "Per-query: ~5.13 mL per query; converted: ~1.28–1.71 mL per 100 words",
      normalization: "Converted to milliliters per 100 words",
      mlPer100Words: 1.5,
      valueRationale: "Midpoint of the reported range 1.28–1.71 mL per 100 words",
      assumptions: ["Typical Claude Sonnet responses are assumed to be ~300–400 words, matching the table conversion."],
      formulaText: FORMULA_TEMPLATE.replace("{mL_per_100_words}", "1.50"),
      note: null
    },
    "gemini-google-comprehensive": {
      id: "gemini-google-comprehensive",
      displayName: "Gemini",
      provider: "Google",
      basis: "Google’s system-level footprint per text prompt",
      originalMetric: "0.26 mL of water per Gemini text prompt (per query)",
      normalization: "Treated as 0.26 mL per 100 words by assuming a median Gemini response ≈ 100 words",
      mlPer100Words: 0.26,
      valueRationale: "Directly from 0.26 mL per query with explicit 100-word median-response assumption",
      assumptions: [
        "Assume a median Gemini text response ≈ 100 words (explicit normalization assumption).",
        "This estimate includes active compute, cooling, power delivery losses, and global serving infrastructure (system-level footprint)."
      ],
      formulaText: FORMULA_TEMPLATE.replace("{mL_per_100_words}", "0.26"),
      note: "Includes cooling + global infrastructure, not just active compute."
    }
  };

  /** @type {Record<string, string>} */
  const SITE_DEFAULT_MODEL = {
    "chatgpt.com": "gpt-4o-azure",
    "claude.ai": "claude-3-5-sonnet-aws",
    "gemini.google.com": "gemini-google-comprehensive"
  };

  function getModelForHostname(hostname) {
    const id = SITE_DEFAULT_MODEL[hostname];
    return id ? MODEL_REGISTRY[id] : null;
  }

  function calcWaterMl(wordCount, mlPer100Words) {
    if (typeof mlPer100Words !== "number" || !Number.isFinite(mlPer100Words)) return null;
    const waterMl = (wordCount / 100) * mlPer100Words;
    return Math.round(waterMl * 100) / 100;
  }

  function formatExplanationText(model) {
    if (!model) return "Water estimate unavailable.";
    const lines = [
      `Model: ${model.displayName} (${model.provider})`,
      `Estimate basis: ${model.basis}`,
      `Original metric: ${model.originalMetric}`,
      `Normalization: ${model.normalization}`,
      `Value used: ${Number(model.mlPer100Words).toFixed(2)} mL / 100 words${model.valueRationale ? ` (${model.valueRationale})` : ""}`,
      "Formula:",
      model.formulaText
    ];
    if (Array.isArray(model.assumptions) && model.assumptions.length) {
      lines.push("Assumptions:");
      for (const a of model.assumptions) lines.push(`- ${a}`);
    }
    if (model.note) lines.push(`Note: ${model.note}`);
    return lines.join("\n");
  }

  // Precompute UI text once (keeps popover/popup simple).
  for (const modelId of Object.keys(MODEL_REGISTRY)) {
    const model = MODEL_REGISTRY[modelId];
    model.explanationText = formatExplanationText(model);
  }

  window.WatergateModels = {
    MODEL_REGISTRY,
    SITE_DEFAULT_MODEL,
    FORMULA_TEMPLATE,
    getModelForHostname,
    calcWaterMl,
    formatExplanationText
  };
})();
