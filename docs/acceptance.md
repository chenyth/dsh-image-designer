# Acceptance status

Date: 2026-10-31. Results refer to this plugin, not other Shenhuo channels.

| Boundary | Evidence | Status |
|---|---|---|
| OAuth browser callback | Local HTTP fixture: PKCE, state and issuer rejection, token persistence permissions | Passed |
| MCP protocol | Real SDK over local HTTP fixture: tools discovery, original arguments and idempotency conflict, recovery without ticket persistence | Passed |
| Original file bytes | Local fixture: upload hash, no OAuth on tickets, unique output names, workspace containment | Passed |
| DSH service integration | Published DSH 0.2.1-rc.5 Cordis tools and skills services accept this plugin | Passed |
| Public OAuth discovery | Official production discovery metadata available, no paid call | Passed |
| DSH Desktop installation | Pending target-host verification | Not yet verified |
| First personal OAuth and live tool discovery | Pending browser consent in target host | Not yet verified |
| Paid design workflow | Requires a current quote and explicit confirmation | Not yet verified |
| Windows | No Windows device evidence | Not yet verified |
| Marketplace | Submission preparation in progress | Not submitted |

Automated protocol tests do not prove that a model follows the entire runtime Skill. Marketplace listing requires external review and does not install the plugin for every user.
