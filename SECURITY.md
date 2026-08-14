# Security Policy

## Supported versions

Version 0.1.x and the latest code on the default branch receive security
fixes. Older pre-release snapshots are unsupported.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Submit a
[private security advisory](https://github.com/Argonaut790/dsh-deepseek-vision/security/advisories/new)
with reproduction steps, impact, affected versions, and any suggested
mitigation. You should receive an acknowledgement within seven days.

## Data and trust boundaries

This plugin sends images to the DSH vision provider selected by the user. That
provider's privacy, retention, and security terms apply. Do not submit images
containing secrets or sensitive data unless the selected provider is approved
to process them.

Images, embedded image text, OCR results, captions, and model responses must be
treated as untrusted input. They may contain misleading content or prompt
injection attempts. Integrators should validate outputs, limit downstream
permissions, and require confirmation before sensitive actions. This project
does not claim to sandbox image content or provider responses.
