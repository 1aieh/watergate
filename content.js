(() => {
  const ML_PER_100_WORDS = 0.57;

  function getAssistantArticles() {
    return document.querySelectorAll('article[data-turn="assistant"][data-turn-id]');
  }

  function getAssistantContainer(article) {
    return article?.querySelector?.('div[data-message-author-role="assistant"]') || null;
  }

  function countWords(text) {
    const t = (text || "").trim();
    if (!t) return 0;
    return t.split(/\s+/).length;
  }

  function calcWaterMl(wordCount) {
    const waterMl = (wordCount / 100) * ML_PER_100_WORDS;
    return Math.round(waterMl * 100) / 100;
  }

  function extractAssistantText(article) {
    const container = getAssistantContainer(article);
    if (!container) return "";

    const md = container.querySelector(".markdown");
    const mdText = md?.innerText;
    if (mdText) return mdText;

    // Fallback: avoid counting our injected badge if `.markdown` isn't present.
    const clone = container.cloneNode(true);
    clone.querySelectorAll(".water-badge").forEach((el) => el.remove());
    return clone.innerText || "";
  }

  function formatBadgeText(wordCount, waterMl) {
    return `This response used ~${waterMl.toFixed(2)} mL of water`;
  }

  function upsertBadgeForArticle(article) {
    const turnId = article.getAttribute("data-turn-id");
    if (!turnId) return;

    const container = getAssistantContainer(article);
    if (!container) return;

    const text = extractAssistantText(article);
    const wordCount = countWords(text);
    const waterMl = calcWaterMl(wordCount);

    const safeTurnId =
      typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(turnId) : turnId;
    const existing = container.querySelector(`.water-badge[data-turn-id="${safeTurnId}"]`);
    const displayText = formatBadgeText(wordCount, waterMl);

    if (existing) {
      // Update for streaming/edits.
      const strong = existing.querySelector("strong");
      if (strong) strong.textContent = displayText;
      else existing.textContent = displayText;
      existing.setAttribute("data-word-count", String(wordCount));
      existing.setAttribute("data-water-ml", String(waterMl));
      return;
    }

    const badge = document.createElement("div");
    badge.className = "water-badge";
    badge.setAttribute("data-turn-id", turnId);
    badge.setAttribute("data-word-count", String(wordCount));
    badge.setAttribute("data-water-ml", String(waterMl));

    const strong = document.createElement("strong");
    strong.textContent = displayText;
    badge.appendChild(strong);

    const md = container.querySelector(".markdown");
    if (md) md.insertAdjacentElement("afterend", badge);
    else container.appendChild(badge);
  }

  function scanAndUpsert() {
    const articles = getAssistantArticles();
    for (const article of articles) upsertBadgeForArticle(article);
  }

  // Prevent double-initialization if the script is injected twice.
  if (window.__waterBadgeInitialized) return;
  window.__waterBadgeInitialized = true;

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

  const observer = new MutationObserver(() => scheduleScan());

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();
