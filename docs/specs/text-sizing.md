# Text sizing

Status: built on `claude/app-analysis-features-5c2dc5`, on top of the canvas pruning (`canvas-pruning.md`).
Scope: plain text only. Sticky and card keep their own boxes.

## Problem

Plain text did not behave like text in FigJam, Miro, tldraw, Excalidraw or Canva:

- The box was about 187px wide whatever you typed, and its height only ever grew. React Flow passes a node its *measured* size, and `TextNode` fed that back into its own `width` and `minHeight`.
- Dragging the middle of a side started a connector, because the connection dot sat on the resize handle. Corner handles were 5×5px and the edges 1px.
- Resizing never scaled the text. After a manual resize the height was fixed, so new lines spilled out of the box and deleted lines left empty space.
- Escape threw away what you typed. On a new text it left an empty "Type something…" box behind.
- Every text had a blank line at the bottom: the markdown HTML ends in a newline, and the body used `white-space: pre-wrap`.

## Behaviour now

| | |
|---|---|
| Height | Always hugs the text. It is never stored; a height saved by an older resize is ignored. |
| Width, auto (default) | The box fits the text and widens as you type. Lines wrap only past 34em, so pasted paragraphs and AI-written text stay readable. The cap scales with the font. |
| Width, fixed | Dragging the left or right side sets a width (`style.width`) and the text wraps. The minimum is about three characters at the current font size, so words don't split. Double-clicking a side handle returns to auto. |
| Corners | Scale the font (10–72px) and a fixed width with it. The opposite corner stays put. |
| Undo | A side or corner drag is one undo step, even if the handles disappear mid-drag. Measuring a node and selecting or deselecting nodes or edges are no longer undo steps, anywhere on the canvas. Before, clicking away after a drag meant the first ⌘Z only reselected the text. |
| Handles | Corners and sides keep the same size on screen at any zoom (14px corners, 12px sides). |
| Connection points | Four dots sit 12px outside the box and show on hover, so they never block resizing. The handle ids are unchanged, so existing arrows stay attached. |
| Escape | Saves what you typed and leaves the text selected. An empty new text is removed. |

## Where

- `src/poc/nodes/TextNode.tsx`: sizing (`fixedWidth` from the node, never the measured size), `TextResizeHandles`, `setTextGeometry`, the one-step undo for drags, Escape. The textarea uses `field-sizing: content`, which replaced the scroll-height measuring.
- `src/poc/FlowCanvas.tsx`: node changes that only measure or select, and edge changes that only select, skip undo history. This applies to every node type, not just text.
- `src/styles.css`: `.react-flow__node-text { height: auto !important }` for heights stored by older boards.

## Evidence

`tests/text.renderer.spec.ts` (9 tests, including a drag cut short mid-way) writes these screenshots to `docs/specs/text-sizing/screenshots/`:

1. `01-auto-width-short`: "Hi" gets a box that fits it.
2. `02-auto-width-long`: a long line widens the box and stays on one line.
3. `03-fixed-width-wraps`: after dragging a side, the text wraps at that width.
4. `04-fixed-width-grows-with-text`: added lines grow the box. Removing them shrinks it again (asserted).
5. `05-corner-scales-font`: a corner drag scales "Launch week" to XL.
6. `06-hover-connection-points`: connection dots outside the box on hover. A drag from one still creates an arrow (asserted).
7. `07-escape-keeps-text`: Escape saves "Keep me" and keeps it selected.

Also checked by hand in the dev app: Escape, a corner drag followed by a click away and ⌘Z, a side drag, the double-click reset, and handle size at 47% zoom.

## Known trade-offs

- Arrows now start 12px off the text box, where the connection dots are, instead of on its edge.
- Consecutive spaces collapse when not editing (no more `pre-wrap`). Line breaks still render, because the markdown renderer turns them into `<br>`.
- In the Browser pane, a new text did not keep keyboard focus after being placed with the Text tool; it needed a click into the box. The committed code behaves the same, so this predates the change, and Playwright focuses it fine. Worth a look in Electron.
- Editing still shows raw markdown, and the box can change size slightly when you finish editing. True WYSIWYG editing is a separate piece of work.
