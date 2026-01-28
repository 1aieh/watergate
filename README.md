# Watergate (ChatGPT water badge) — Chrome extension

Shows an estimated “water used” badge under each **assistant** response on `https://chatgpt.com/*`.

## Local testing (Load Unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select this folder: `/Users/laiehjwella/Dev/Watergate`.
5. Open (or reload) a ChatGPT conversation at `https://chatgpt.com/*`.

You should see a small badge under each assistant response that says:
“This response used ~X.XX mL of water”.

## DevTools validation (selectors / acceptance checks)

Open DevTools Console on `https://chatgpt.com/*` and run:

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
const badges = [...document.querySelectorAll('.water-badge[data-turn-id]')];
const badgeIds = badges.map((b) => b.getAttribute('data-turn-id'));
({
  assistantTurns: assistantArticles.length,
  badges: badges.length,
  uniqueAssistantTurnIds: new Set(turnIds).size,
  uniqueBadgeTurnIds: new Set(badgeIds).size,
  missingBadgesForTurnIds: turnIds.filter((id) => !badgeIds.includes(id)),
});

// 5) Spot-check a single assistant turn contains exactly one badge inside its assistant container
(() => {
  const a = document.querySelector('article[data-turn="assistant"][data-turn-id]');
  if (!a) return null;
  const turnId = a.getAttribute('data-turn-id');
  const container = a.querySelector('div[data-message-author-role="assistant"]');
  return {
    turnId,
    badgesInThisTurn: container?.querySelectorAll(`.water-badge[data-turn-id="${turnId}"]`).length ?? null,
  };
})()
```

## Streaming update check

1. In an existing chat, send a new prompt and watch the assistant response stream in.
2. The badge should appear under the assistant response and update (the number may change) as the text grows.
3. You should still end up with **exactly one** badge for that assistant `data-turn-id`.

## Troubleshooting

- If you don’t see badges, hard refresh the page and ensure the extension is enabled.
- This extension only runs on `https://chatgpt.com/*` (it won’t run on other domains).
- If ChatGPT’s DOM changes, the selectors may need updating in `content.js`.
