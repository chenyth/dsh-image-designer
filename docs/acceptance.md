# Acceptance status

Date: 2026-10-31. Results refer to this plugin, not other Shenhuo channels.

| Boundary | Evidence | Status |
|---|---|---|
| OAuth browser callback | Local HTTP fixture: PKCE, state and issuer rejection, token persistence permissions | Passed |
| MCP protocol | Real SDK over local HTTP fixture: tools discovery, original arguments and idempotency conflict, recovery without ticket persistence | Passed |
| Original file bytes | Local fixture: upload hash, no OAuth on tickets, unique output names, workspace containment | Passed |
| Production upload | Re-uploaded the fictional delivered poster as an authorized reference; service receipt SHA-256 matches original bytes | Passed |
| DSH service integration | Published DSH 0.2.1-rc.5 Cordis tools and skills services accept this plugin | Passed |
| Public OAuth discovery | Official production discovery metadata available, no paid call | Passed |
| DSH Desktop installation | macOS DSH 0.2.1-rc.5, installed and enabled through Desktop plugin manager | Passed |
| First personal OAuth and live tool discovery | Browser consent via plugin OAuth client; DSH status and live directory tools verified | Passed |
| Paid design workflow | Same plugin MCP client: proposal → valid quote → explicit 50-credit approval → generation → original-byte download | Passed at protocol boundary |
| DSH recovery and delivery | DSH model loaded the Skill, read original operation records, queried the completed generation, downloaded and displayed its image in the local workspace | Passed |
| Windows | No Windows device evidence | Not yet verified |
| Marketplace | [Submission PR #10821](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/10821), one entry only; repo eligible for one-day age gate on 2026-11-01 at 05:57:26 UTC | Submitted, external review pending |

Automated protocol tests do not prove that a model follows the entire runtime Skill. Marketplace listing requires external review and does not install the plugin for every user.

The live sample is a fictional book-club poster, 1344×1792 PNG, Pro / 1.5K. Separate service receipts report 20 credits for the proposal and 50 credits for generation. No combined charge is inferred. The DSH recovery reply correctly labels the 50-credit result as historical settlement and states that no new settlement receipt was provided for recovery.

The recovery model initially described an earlier pending download ticket as expired without sufficient evidence. The resume result now supplies an observation timestamp and explicit ticket-expiration evidence; pending ticket state is distinguished from generation and expiry. The image is the actual delivered result, not a mockup.
