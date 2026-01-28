# Watergate (AI water badge) — Chrome extension

Shows an estimated “water used” badge under each **assistant/model** response on:
- `https://chatgpt.com/*`
- `https://claude.ai/*`
- `https://gemini.google.com/*`

Notes:
- ChatGPT + Claude show numeric estimates (defaults are hardcoded per-site).
- Gemini shows: **Water estimate unavailable (Gemini model not mapped yet)**.

## Local testing (Load Unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select this folder: `/Users/laiehjwella/Dev/Watergate`.
5. Open (or reload) a supported site.

You should see a small badge under each assistant response that says:
“This response used ~X.XX mL of water”.

## DevTools validation (selectors / acceptance checks)

### ChatGPT (`https://chatgpt.com/*`)

Open DevTools Console and run:

```js
// 1) Count assistant turns (baseline)
document.querySelectorAll('article[data-turn="assistant"][data-turn-id]').length

// 2) Confirm we can read assistant text (plan selector)
document
  .querySelector('article[data-turn="assistant"] div[data-message-author-role="assistant"] .markdown')
  ?.innerText
```

Additional useful checks (recommended):

```js
// 3) Ensure we only inject into assistant containers (no user turns)
document.querySelectorAll('article[data-turn="user"] .water-badge').length

// 4) Exactly one badge per assistant data-turn-id
const assistantArticles = [...document.querySelectorAll('article[data-turn="assistant"][data-turn-id]')];
const turnIds = assistantArticles.map((a) => a.getAttribute('data-turn-id'));
const badges = [...document.querySelectorAll('.water-badge[data-water-key]')];
const badgeKeys = badges.map((b) => b.getAttribute('data-water-key'));
({
  assistantTurns: assistantArticles.length,
  badges: badges.length,
  uniqueAssistantTurnIds: new Set(turnIds).size,
  uniqueBadgeKeys: new Set(badgeKeys).size,
});

// 5) Spot-check a single assistant turn contains exactly one badge inside its assistant container
(() => {
  const a = document.querySelector('article[data-turn="assistant"][data-turn-id]');
  if (!a) return null;
  const turnId = a.getAttribute('data-turn-id');
  const container = a.querySelector('div[data-message-author-role="assistant"]');
  return {
    turnId,
    badgesInThisTurn: container?.querySelectorAll(`.water-badge[data-water-key="chatgpt::${turnId}"]`).length ?? null,
  };
})()
```

### Claude (`https://claude.ai/*`)

Open DevTools Console and run:

```js
// 1) Count markdown blocks used for assistant responses
document.querySelectorAll(".standard-markdown").length

// 2) Ensure we do NOT inject into user message bubbles
document.querySelectorAll('[data-testid="user-message"] .water-badge').length

// 3) Sanity: we have some badges on the page
document.querySelectorAll(".water-badge[data-water-key]").length
```

### Gemini (`https://gemini.google.com/*`)

Open DevTools Console and run:

```js
// 1) Count model response markdown blocks
document.querySelectorAll("structured-content-container .markdown.markdown-main-panel").length

// 2) Ensure we do NOT inject into user prompts
document.querySelectorAll("user-query .water-badge").length

// 3) Gemini should show the “unavailable” message by default
[...document.querySelectorAll(".water-badge strong")]
  .map((n) => n.innerText)
  .some((t) => t.includes("Water estimate unavailable"))
```

## Streaming update check

1. In an existing chat, send a new prompt and watch the assistant/model response stream in.
2. The badge should appear under the assistant response and update (the number may change) as the text grows.
3. You should still end up with **exactly one** badge for that assistant `data-turn-id`.

## Troubleshooting

- If you don’t see badges, hard refresh the page and ensure the extension is enabled.
- This extension only runs on the supported domains listed above.
- If a site’s DOM changes, the selectors may need updating in `content.js`.
