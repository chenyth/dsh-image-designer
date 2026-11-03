# Changelog

## 0.1.3 — 2026-11-03

- Expose a token-free, same-process Cordis connection capability for dsh-image-editor. The original 12 designer tools remain unchanged.
- Refresh the existing OAuth grant once for an insufficient_scope challenge, preserving authorization and task records.
- Verify shared authorization through a real DSH image-editor separation and saved-document PSD delivery; no credentials are copied to the editor.


## 0.1.2 — 2026-10-31

- Use the official red flame on a transparent background, matching DSH's standalone plugin icon presentation.
- Ship the original 512px brand asset at a new icon path so installed clients and storefronts refresh it.

## 0.1.1 — 2026-10-31

- Add DSH-native localized display metadata: 神火设计师 in Chinese and Image Designer in English, each with its own introduction.
- Export and ship `locale/en.json` and `locale/zh.json`; display text follows DSH's interface language.
- Verify metadata using DSH's actual `readPluginMeta` reader.
- Declare the existing intended DSH compatibility range in the supported `engines.dsh` manifest field.

## 0.1.0 — 2026-10-31

- Initial personal OAuth, remote designer tools, bundled runtime Skill, original-byte file transfers, quote-confirmed generation and task recovery.
- Verified a real fictional book-club poster and DSH recovery/download display.
