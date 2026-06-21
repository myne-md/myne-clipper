// The locked/closed/unpaired prompt DOM builder (clip-time-ux task 5 — the prompt
// "design" as renderable code). Turns a `PromptModel` into a detached element
// tree, given a `Document` and the activate/dismiss handlers. Behavior (which
// kind to show, open/foreground dispatch, no-state-retained) is the controller's
// (task 7); this only describes structure + a11y + token-class wiring.
//
// The whole panel's main region is ONE `button` so the entire surface is the
// click target (task 5 acceptance), with a small corner `x` dismiss. The message
// + action are set via `textContent` (never innerHTML). It shows NO folders/tags/
// structure and no "saved/queued" affordance — there is nothing to show.
import { iconSvg } from "../lib/icon-svg";
import { DISMISS_NOTICE } from "../lib/load-bearing-copy";
import type { PromptModel } from "../lib/prompt-model";

/** Component-style id under which `prompt.css` is injected into the shadow root. */
export const PROMPT_STYLE_ID = "prompt";

/** Click handlers the prompt wires. */
export interface PromptHandlers {
  /** Invoked when the whole-surface activate control is clicked (open/foreground). */
  readonly onActivate: () => void;
  /** Invoked when the corner dismiss control is clicked (retains no state). */
  readonly onDismiss: () => void;
}

/**
 * Build the prompt element from its model. Returns a detached
 * `<div.myne-prompt>` carrying the `role="status"` + `aria-live="polite"`
 * contract, a full-surface activate `button` (labeled message + action), the
 * leading `circle-alert` glyph, and a corner dismiss — each with its
 * `data-testid` hook. The caller mounts it into the overlay anchor.
 */
export function renderPrompt(
  doc: Document,
  model: PromptModel,
  handlers: PromptHandlers,
): HTMLElement {
  const el = doc.createElement("div");
  el.className = "myne-prompt";
  el.setAttribute("role", model.role);
  el.setAttribute("aria-live", model.ariaLive);
  el.dataset.testid = model.testid;
  el.dataset.kind = model.kind;

  const main = doc.createElement("button");
  main.type = "button";
  main.className = "myne-prompt__main";
  main.dataset.testid = model.actionTestid;
  // The button's accessible name = the honest message + the action verb.
  main.setAttribute("aria-label", `${model.message} — ${model.action}`);
  main.addEventListener("click", () => handlers.onActivate());

  const glyph = doc.createElement("span");
  glyph.className = "myne-prompt__glyph";
  glyph.setAttribute("aria-hidden", "true");
  // Render at the exact 18 px display box with a 2-weight stroke: the default
  // 1.5 weight in the 24-unit viewBox downscales to a ~1.1 px sub-pixel stroke
  // that reads soft/"pixelated" at this size; 2 lands a crisp ~1.5 px line.
  glyph.innerHTML = iconSvg(model.glyph, { size: 18, strokeWidth: 2 });
  main.appendChild(glyph);

  const text = doc.createElement("span");
  text.className = "myne-prompt__text";
  const message = doc.createElement("span");
  message.className = "myne-prompt__message";
  message.textContent = model.message;
  const action = doc.createElement("span");
  action.className = "myne-prompt__action";
  action.textContent = model.action;
  text.append(message, action);
  main.appendChild(text);

  el.appendChild(main);

  const dismiss = doc.createElement("button");
  dismiss.type = "button";
  dismiss.className = "myne-prompt__dismiss";
  dismiss.dataset.testid = model.dismissTestid;
  dismiss.setAttribute("aria-label", DISMISS_NOTICE);
  dismiss.innerHTML = iconSvg("x", { size: 14 });
  dismiss.addEventListener("click", () => handlers.onDismiss());
  el.appendChild(dismiss);

  return el;
}
