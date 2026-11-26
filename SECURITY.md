# Security Policy

## Reporting a vulnerability

Report security issues to **security@myne.md** privately. Please do not open a
public GitHub issue for a vulnerability.

If you do not get an acknowledgment within 5 business days, send a reminder; the
address may have failed silently.

## What to include

- A description of the issue and its impact.
- Steps to reproduce, or a proof of concept.
- The affected component: the extension, the native-messaging handoff, the
  desktop side, or the pairing/status protocol.
- Browser and extension version.
- How you want to be credited.

## Scope

In scope:

- The keyless invariant: any path that gives the extension a key, a decrypt
  capability, a plaintext queue, or access to vault contents.
- Native-messaging framing, authentication and the pairing token.
- Permission or host-access escalation, content-script injection beyond the
  user gesture, or a way to capture without one.
- A lookalike extension or store listing presenting itself as the official Myne
  Clipper. We do not operate a store listing; report impersonation.

Out of scope:

- The desktop app's cryptography and vault handling: report those against
  `myne-md/myne`.
- A modified build loaded by a third party; source is available and the user is
  responsible for what they load.
- Third-party dependencies: report upstream first; we will relay.

## Response commitment

- Acknowledge within 5 business days.
- Initial assessment within 14 days.
- Coordinated disclosure: we ask for a 90-day window from acknowledgment,
  extended by agreement if a fix needs more time.

## Pre-1.0 caveat

Myne is pre-alpha. The extension and the native-messaging host are still
hardening; reports outside the documented threat model (TB10/A14 in the main
repo's `docs/threat-model.md`) are still welcome.
