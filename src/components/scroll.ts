/** Nearest ancestor that scrolls vertically (the chat list or the activity panel). */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

/**
 * Scrolls so `el` is fully visible, e.g. after an inline editor opens and grows past the fold.
 * Prefers the smallest scroll that shows the bottom (its action buttons), but never pushes the
 * top out of view when the element is taller than the visible area.
 */
export function revealInScroller(el: HTMLElement, margin = 16) {
  const parent = scrollParent(el);
  if (!parent) return;
  const box = el.getBoundingClientRect();
  const view = parent.getBoundingClientRect();
  const top = box.top - view.top + parent.scrollTop; // element top within the scrollable content
  const bottom = box.bottom - view.top + parent.scrollTop;
  const wanted = Math.max(parent.scrollTop, bottom - parent.clientHeight + margin);
  parent.scrollTo({ top: Math.min(wanted, top - margin), behavior: 'smooth' });
}
