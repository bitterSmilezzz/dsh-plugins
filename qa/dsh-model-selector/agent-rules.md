# QA rules for dsh-model-selector

The subject under test is a browser-half DSH plugin that replaces the composer's
model seat (`conversation.input.model`) with a single-pane menu: search box on
top, provider-grouped model rows, and an inline reasoning-effort slider pinned in
the menu footer. The official `/model` popup command still exists and is a
separate surface — it is out of scope here.

## Ground rules

- Interact only with the model seat, its menu, and the app theme toggle. Do not
  send chat messages, do not open settings, do not touch other plugins' seats.
- A model or effort switch is an RPC: allow the seat label to settle instead of
  treating a short delay as failure. Never report a pass from the label alone
  without the row/level text agreeing.
- The menu closes on an outside click and on Escape; a toast anchored to the
  composer card is the surviving feedback after it closes, and it auto-dismisses.
  Assert toasts immediately after the action that raised them.
- Rows carry: model name, optional short description, optional provider tag
  (shown when the search result spans providers with the same model name), an
  optional reasoning badge, and a check mark on the current selection.
- Effort levels are adapter-supplied and differ per model: names are not a fixed
  ladder, and a model may expose as few as two levels.
- The light and dark themes are both in scope. Judge legibility, not pixel
  equality.

## What must never regress

- The selected row is distinguishable by a background fill, not only by an icon.
- Every menu item announces itself as a radio menu item inside a named menu.
- The slider always shows the level name it currently sits on.
- A rejected selection says why, outside the menu.
