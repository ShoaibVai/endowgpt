# Upstream licenses included with endowGPT

endowGPT is a deployment layer on top of two upstream projects. Their code ships
inside this repository under its own license terms. The in-app `/credits` page
mirrors this file.

## LibreChat

MIT License

Copyright (c) 2026 LibreChat

Source: `LibreChat-main/LICENSE` (full text shipped with the code)

## LibreChat RAG API

MIT License

Copyright (c) 2024 Danny Avila

Source: `rag-api-main/LICENSE` (full text shipped with the code)

## Runtime dependencies

The app bundles many client-side and server-side dependencies, each under its own
license (MIT, Apache-2.0, BSD, ISC, MPL-2.0 for some fonts/icons, OFL for fonts,
and CC-BY for certain artwork). A complete list of npm packages and their licenses
can be generated from the workspace lockfiles with
`npx license-checker --summary` in `LibreChat-main` and `LibreChat-main/client`.

Notable bundled media and libraries:

| Asset / library | License | Notes |
|---|---|---|
| TipTap (MIT) | editor engine |
| marked (MIT), turndown+gfm (MIT) | Markdown ↔ HTML |
| diff (MIT) | word diffing |
| docx (MIT) | Word export |
| jspdf (MIT) | PDF export |
| endowGPT logo and reveal animation | endowGPT brand asset |
