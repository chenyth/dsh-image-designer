# Image Designer

[简体中文](README.md)

Commission Shenhuo AI image designers from **DeepSeek Harness**, using your personal Shenhuo account and credits. Submit your original brief and materials, choose a matched designer, answer necessary questions, review the proposal and quote, then approve image generation and download the results.

![Actual delivered book-club poster](docs/book-club-demo.png)

This fictional book-club poster was delivered through the plugin's live MCP client (1344×1792, Pro / 1.5K). DSH Desktop separately verified recovery, download, and image display. Separate service receipts report 20 proposal credits and 50 generation credits for this sample; future tasks use their own current quotes.

## Install

Requires compatible DSH versions starting at `0.2.1-rc.5`, Node.js `24.9+`, and a local workspace. [Marketplace submission #10821](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/10821) was merged on November 1, 2026. The marketplace's pinned package can lag behind GitHub Releases; use the release asset for the version you need.

In DSH Desktop, open **Plugins → Add plugin**, enter `github:chenyth/dsh-image-designer`, install, and enable it. CLI profiles can use:

```bash
dsh plugin --profile web add github:chenyth/dsh-image-designer
```

Restart that CLI profile after installation. Electron-managed profiles must use the Desktop plugin manager. Prebuilt `.tgz` assets are provided in [Releases](https://github.com/chenyth/dsh-image-designer/releases).

## Use

Invoke `/shenhuo-designers` or ask to use Shenhuo Image Designer. On first use, open the link returned by `shenhuo_connect` in a browser on the same computer as DSH. Log into or [register for Shenhuo](https://www.shenhuoai.com/register), authorize, then return to DSH and say you have authorized. The plugin verifies your account and discovers the live MCP tool schemas.

The plugin's display name and description follow DSH's interface language: **Image Designer** in English and **神火设计师** in Chinese. Change DSH's language in **Settings → General → Language**. Other languages use DSH's fallback rules. The technical package name remains `dsh-image-designer`.

Example: “Use Shenhuo Image Designer to design product images from products/coffee.png. Keep the brand name Mountain Coffee. Match a suitable designer first, then show me the proposal and quote.”

Matching and proposals may consume personal credits. Image generation requires your explicit confirmation of the current quote. If credits are insufficient, [recharge on the website](https://www.shenhuoai.com/home/recharge) with the same account, then resume the original task and confirm the refreshed quote.

## Files and recovery

Uploads read original bytes from the current local workspace and verify their SHA-256 receipts. Copy outside files into the workspace first. Downloads go to `shenhuo-images/` by default, preserve existing files, and return actual local paths and hashes. Remote/SSH workspaces are outside the initial file-transfer scope.

Keep polling the same generation task until it reaches a terminal state. Deliver settled partial successes and report unfinished pages. Expired download tickets require a fresh result receipt, not another generation. `shenhuo_resume` loads operation IDs and stable idempotency records for the currently authorized account; live status and charges always come from the service.

## Privacy and scope

Uses the official remote HTTPS MCP and personal OAuth; no API key or password is entered into model tools. Private local state defaults to `~/.dsh-image-designer/`, with directory mode `0700` and file mode `0600`. It contains OAuth credentials and original operation parameters needed for recovery, including briefs. Never publish or share that directory. Set `DSH_IMAGE_DESIGNER_DATA_DIR` or plugin `dataDir` for an independent local directory.

Revoke access from Shenhuo’s connected applications page. Uninstalling stops the local integration; existing website projects remain available in your account.

The initial release supports new design tasks. Existing-result revision, regeneration, layer editing, and local models are outside this release. Live designers, public model tiers, credit prices, and available deliverables are determined by the service. [Acceptance status](docs/acceptance.md) distinguishes automated tests from actual host and account tests.

## Development

```bash
npm ci --ignore-scripts
npm test
npm run doctor
npm pack
```

Plain ESM runs without install-time builds. `doctor` checks OAuth discovery and, when authorized, account and tool discovery without paid design calls. The shared runtime contract is rendered from Shenhuo’s `plugin-mcp` templates; source hashes are recorded in [runtime-source.json](docs/runtime-source.json).

[Shenhuo AI](https://www.shenhuoai.com) · [Issues](https://github.com/chenyth/dsh-image-designer/issues) · [MIT License](LICENSE)

## Shared connection for Image Editor

Version `0.1.3` provides an in-process connection interface for [dsh-image-editor 0.2.0](https://github.com/chenyth/dsh-image-editor). The companion reuses the original personal OAuth session without copying credentials or creating another login. The original 12 designer tools remain unchanged. Shared calls are limited to account, upload and layer operations; quote confirmation, task recovery and file delivery remain the editor's responsibility. Newly published scopes refresh the existing grant first.
