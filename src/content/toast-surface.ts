// The real DOM toast surface (clip-time-ux task 6 — the thin adapter behind the
// controller's `ToastSurface` seam). Mounts a rendered toast into the shared
// Shadow DOM overlay, injecting `toast.css` once. No behavior lives here — the
// controller (`./toast-controller`) owns replace/dismiss/timers; this only puts
// elements on screen and lets them animate out + remove.
import type { ToastModel } from "../lib/toast-model";

import { ensureOverlay } from "./overlay";
import type { ToastHandle, ToastSurface } from "./toast-controller";
import toastCss from "./toast.css";
import { renderToast, TOAST_STYLE_ID, type ToastHandlers } from "./toast-view";

/** Build the production toast surface bound to a real `Document`. */
export function createDomToastSurface(doc: Document = document): ToastSurface {
  return {
    mount(model: ToastModel, handlers: ToastHandlers): ToastHandle {
      const overlay = ensureOverlay(doc);
      overlay.injectStyle(TOAST_STYLE_ID, toastCss);
      const el = renderToast(doc, model, handlers);
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
