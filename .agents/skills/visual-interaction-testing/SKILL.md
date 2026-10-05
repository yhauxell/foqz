---
name: visual-interaction-testing
description: Autonomous visual and interaction testing workflow for Foqz. Use whenever developing, modifying, or refactoring UI components, React Flow spatial canvas nodes, settings, modal flows, or Electron window features. Guides live interactive driving via CDP/Vite, automated Playwright regression testing, and multimodal visual inspection using view_file.
---

# Visual & Interaction Testing Workflow for Foqz

This skill establishes the standard workflow for the AI assistant and developer to build, interact with, visually inspect, and regression-test features in Foqz.

## Core Philosophy

1. **Never guess visual appearance**: Don't assume CSS, Tailwind classes, or layout math rendered properly without seeing it.
2. **Drive before commit**: Run interactions live (clicks, typing, drags) or run the Playwright test suite.
3. **Multimodal inspection**: Inspect captured screenshots directly using `view_file`. Verify layout alignment, margins, text clipping, canvas edges, and dark/light themes.

---

## The Feature Development Loop

```
1. Implement/Modify Feature Code
       │
       ▼
2. Trigger Live Interaction or Test
   (node scripts/live-interact.mjs ... OR npx playwright test)
       │
       ▼
3. Agent Visually Inspects Output via view_file
   (Inspect layout, typography, canvas geometry, themes)
       │
       ▼
4. Fix Any Styling / State Glitches
       │
       ▼
5. Run Full Regression Suite (npm run test:e2e)
```

---

## 1. Live Interactive Driving (During Development)

When developing a feature live against Vite (`http://127.0.0.1:5173`) or Electron with CDP (`--remote-debugging-port=9222`):

### Available CLI Actions

Use [scripts/live-interact.mjs](file:///Users/yausellruiz/projects/foqz/scripts/live-interact.mjs):

```bash
# Capture full viewport screenshot and print path
node scripts/live-interact.mjs screenshot <label>

# Inspect live URL, title, and canvas preview
node scripts/live-interact.mjs inspect

# Click an element (auto-captures post-click screenshot)
node scripts/live-interact.mjs click "button[aria-label='Settings']"

# Type into inputs or search bars
node scripts/live-interact.mjs type "input[placeholder*='Jump to project']" "My Task"

# Drag canvas nodes or panning viewport
node scripts/live-interact.mjs drag <fromX> <fromY> <toX> <toY>

# Evaluate in-memory React/Zustand store or DOM properties
node scripts/live-interact.mjs eval "useFlowCanvasStore.getState().selectedNodeId"
```

### Multimodal Visual Verification Rule
Immediately after running `screenshot`, `click`, or `drag`, **call `view_file` on the resulting `.png` file**.
Review:
- Are components clipped or overflowing?
- Are React Flow nodes and bezier connections correctly positioned?
- Are modal overlays and z-indexes stacking properly?
- Is theme contrast (dark/light mode) readable?

---

## 2. Automated Regression Testing (Playwright)

For persistent assertions and regression gates, add or run tests in the `tests/` directory:

* [tests/canvas.renderer.spec.ts](file:///Users/yausellruiz/projects/foqz/tests/canvas.renderer.spec.ts): Web renderer tests (fast headless Vite tests).
* [tests/app.electron.spec.ts](file:///Users/yausellruiz/projects/foqz/tests/app.electron.spec.ts): Electron desktop integration tests (launching native app).

### Running Tests

```bash
# Run all tests
npm run test:e2e

# Run only renderer canvas & modal tests
npx playwright test --project=renderer

# Run only native Electron tests
npx playwright test --project=electron

# Update visual baseline snapshots if UI changes are intentional
npm run test:e2e:update
```

---

## 3. Writing New Feature Tests

When adding a new feature (e.g. a new node type, toolbar action, or modal), append a test case in `tests/`:

```ts
import { test, expect } from '@playwright/test';

test('new feature interaction and visual verification', async ({ page }) => {
  await page.goto('/');

  // 1. Trigger feature action
  const button = page.locator("button[aria-label='New Action']");
  await button.click();

  // 2. Assert DOM state
  await expect(page.locator('.my-new-component')).toBeVisible();

  // 3. Capture screenshot for agent visual verification
  await page.screenshot({ path: 'test-results/new-feature-verified.png' });
});
```

---

## 4. Checklist Before Finishing Any Feature

- [ ] Code compiles and TypeScript passes (`npm run build`).
- [ ] Feature tested interactively or via Playwright.
- [ ] Visual screenshot inspected via `view_file` without layout errors.
- [ ] All tests passing (`npm run test:e2e`).
