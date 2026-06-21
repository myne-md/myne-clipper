// The real DOM prompt surface (clip-time-ux task 7 — the thin adapter behind the
// controller's `PromptSurface` seam). Mounts a rendered prompt into the shared
// Shadow DOM overlay, injecting `prompt.css` once. No behavior lives here.
import type { PromptModel } from "../lib/prompt-model";

import { ensureOverlay } from "./overlay";
import type { PromptHandle, PromptSurface } from "./prompt-controller";
import promptCss from "./prompt.css";
import { renderPrompt, PROMPT_STYLE_ID, type PromptHandlers } from "./prompt-view";

/** Build the production prompt surface bound to a real `Document`. */
export function createDomPromptSurface(doc: Document = document): PromptSurface {
  return {
    mount(model: PromptModel, handlers: PromptHandlers): PromptHandle {
      const overlay = ensureOverlay(doc);
      overlay.injectStyle(PROMPT_STYLE_ID, promptCss);
      const el = renderPrompt(doc, model, handlers);
      overlay.anchor.appendChild(el);
      return {
        markLeaving(): void {
          el.dataset.leaving = "true";
        },
        remove(): void {
          el.remove();
        },
      };
    },
  };
}
