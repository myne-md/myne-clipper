// The clip-success toast DOM builder (clip-time-ux task 4 — the toast "design"
// as renderable code). Pure-ish: turns a `ToastModel` into a detached element
// tree, given a `Document` and the action handlers. The behavior (mount, replace,
// auto/manual dismiss, view dispatch) is the controller's (task 6); this only
// describes the structure + a11y + token-class wiring.
//
// The leading chip + the dismiss `x` are inlined `iconSvg` strings (our own
// trusted glyph constants — never page input). The message is set via
// `textContent` (never innerHTML) so a clip's title can never inject markup.
import { iconSvg } from "../lib/icon-svg";
import { DISMISS_NOTICE } from "../lib/load-bearing-copy";
import type { ToastModel } from "../lib/toast-model";

/** Component-style id under which `toast.css` is injected into the shadow root. */
export const TOAST_STYLE_ID = "toast";

/** Click handlers the toast wires (view is absent for the bookmark variant). */
export interface ToastHandlers {
  /** Invoked when the inline "view" action is clicked (clip variant only). */
  readonly onView?: () => void;
  /** Invoked when the manual-dismiss control is clicked. */
  readonly onDismiss: () => void;
}

/**
 * Build the toast element from its model. Returns a detached `<div.myne-toast>`
 * carrying the `role="status"` + `aria-live="polite"` contract, the success
 * chip, the honest message, the optional "view" action, and the dismiss control
 * — each with its `data-testid` hook. The caller mounts it into the overlay
 * anchor.
 */
export function renderToast(
  doc: Document,
  model: ToastModel,
  handlers: ToastHandlers,
): HTMLElement {
  const el = doc.createElement("div");
  el.className = "myne-toast";
  el.setAttribute("role", model.role);
  el.setAttribute("aria-live", model.ariaLive);
  el.dataset.testid = model.testid;
  el.dataset.variant = model.variant;
  // Tone drives the chip color (success `--success` / error `--danger`); the chip
  // SHAPE (check vs alert) + the message carry the meaning without color (a11y).
  el.dataset.tone = model.tone;

  const chip = doc.createElement("span");
  chip.className = "myne-toast__chip";
  chip.setAttribute("aria-hidden", "true");
  // Render at the exact 16 px chip box with a 2-weight stroke (matches the
  // prompt glyph): the default 1.5 weight downscales to a soft sub-pixel line.
  chip.innerHTML = iconSvg(model.chipGlyph, { size: 16, strokeWidth: 2 });
  el.appendChild(chip);

  const message = doc.createElement("span");
  message.className = "myne-toast__message";
  message.textContent = model.message;
  el.appendChild(message);

  if (model.viewAction) {
    const view = doc.createElement("button");
    view.type = "button";
    view.className = "myne-toast__view";
    view.textContent = model.viewAction.label;
    view.dataset.testid = model.viewAction.testid;
    view.addEventListener("click", () => handlers.onView?.());
    el.appendChild(view);
  }

  const dismiss = doc.createElement("button");
  dismiss.type = "button";
  dismiss.className = "myne-toast__dismiss";
  dismiss.dataset.testid = model.dismissTestid;
  dismiss.setAttribute("aria-label", DISMISS_NOTICE);
  dismiss.innerHTML = iconSvg("x", { size: 14 });
  dismiss.addEventListener("click", () => handlers.onDismiss());
  el.appendChild(dismiss);

  return el;
}
