// The native-messaging host rendezvous name.
//
// Mirrors the desktop's `clipper::manifest::HOST_NAME` (`md.myne.clipper`,
// reverse-DNS in the app bundle-identifier family `md.myne.*`). The browser
// keys the installed native-host manifest by this name; `connectNative` MUST
// use it verbatim — a mismatch makes the connection silently fail to open.
//
// A bare string constant, NOT a dependency. If the desktop renames the host,
// this constant changes in lock-step (one source of truth per side; the
// desktop side is the authority).
export const HOST_NAME = "md.myne.clipper";
