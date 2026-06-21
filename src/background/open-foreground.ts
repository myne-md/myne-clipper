// Open/foreground the Myne desktop (clip-time-ux task 7 — the extension SIDE of
// the open-foreground action; the locked prompt + the toast "view" both invoke
// it).
//
// What this is, honestly: the keyless extension INVOKES the native-messaging
// transport — opening a port to the registered host asks the OS to launch the
// host if it isn't running. Bringing the desktop WINDOW to the foreground (and
// navigating to a just-saved note) is the DESKTOP's responsibility (sub-feature 1
// / desktop-ingest own that transport end); this side only pokes it. The
// extension holds no key and learns no note id from the tiny host reply, so
// "view" can only foreground Myne, never deep-link a specific note id from here.
//
// Keyless + storage-free: this writes nothing and sends no clip — it is a launch
// poke, not a capture.
import browser from "webextension-polyfill";

import { HOST_NAME } from "./host-name";

/**
 * Best-effort: open (and immediately close) a native-messaging port to the host
 * so the OS launches the registered desktop if it is closed. Never throws — if
 * the host is not installed there is nothing the keyless extension can do, and
 * the prompt the user clicked already told them to open Myne.
 */
export function openMyneForeground(): void {
  try {
    const port = browser.runtime.connectNative(HOST_NAME);
    try {
      port.disconnect();
    } catch {
      // already gone
    }
  } catch {
    // Host not registered / unreachable — nothing else to do.
  }
}
