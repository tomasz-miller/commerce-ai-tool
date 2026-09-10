# Security Policy

## Reporting a vulnerability

Please **do not** report security vulnerabilities through public GitHub Issues, Discussions, or pull requests.

Report them privately via GitHub: [Report a vulnerability](https://github.com/tomasz-miller/commerce-ai-tool/security/advisories/new).

Include as much of the following as you can:

- Affected package, version, tag, or commit SHA
- A description of the issue and why it is security-sensitive
- Steps to reproduce (a full exploit is not required)
- Potential impact
- Any suggested mitigations or fixes

## Response

This is a solo-maintained project. There is no 24/7 on-call rotation and no bug bounty.

You should receive an acknowledgement within **7 business days**. After that we will discuss severity, a fix, and a disclosure timeline.

## Supported versions

| Version | Supported |
| --- | --- |
| Latest `main` | Yes |
| Latest published `@commerce-ai-tool/*` (currently `0.1.x`) | Yes |
| Older package lines | No |

## Scope

In scope — issues in `@commerce-ai-tool/core`, `@commerce-ai-tool/server`, `@commerce-ai-tool/react`, and `@commerce-ai-tool/angular`, including:

- Secrets reaching the browser from this plugin
- Cross-site scripting in the search widgets
- Prompt injection in the search pipeline that leads to unintended actions
- Cart or checkout API abuse caused by this plugin's code

Out of scope:

- Host application misconfiguration (for example API keys in client bundles, overly permissive CORS)
- Vulnerabilities in commercetools, OpenRouter, AWS Bedrock, or ElevenLabs
- Issues that exist only in `apps/demo-next` and do not affect the published packages

## Disclosure

We prefer coordinated disclosure. A GitHub Security Advisory will be published after a fix is available, or on a timeline we agree with you.
