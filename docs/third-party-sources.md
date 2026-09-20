# Third-party sources — 20 September 2026

| Package | Installed version | License | Source | Integration owner |
|---|---|---|---|---|
| @tanstack/react-table | 8.21.3 | MIT | https://github.com/TanStack/table.git | T2Q application |
| @tanstack/table-core | 8.21.3 | MIT | https://github.com/TanStack/table.git | T2Q application |
| dexie | 4.4.6 | Apache-2.0 | https://github.com/dexie/Dexie.js.git | T2Q application |
| @uppy/core | 6.0.1 | MIT | git+https://github.com/transloadit/uppy.git | T2Q application |
| pdfjs-dist | 6.3.289 | Apache-2.0 | git+https://github.com/mozilla/pdf.js.git | T2Q application |
| konva | 10.6.0 | MIT | git://github.com/konvajs/konva.git | T2Q application |
| react-email | 6.9.5 | MIT | https://github.com/resend/react-email.git | T2Q application |

Package versions are exact pins. The source register is not an assertion that every optional upstream service is included.

TanStack v8 is chosen for its small, stable React API and declared React >=16.8 compatibility; the broader repository now also develops v9.
React Email uses the maintained `react-email` package; `@react-email/components` was deprecated and was removed before implementation.
No copyleft invoicing app code, supplier standards, demo images or trademarks were copied.

- `src/components/ui/input.tsx` adapts the MIT shadcn/ui Input primitive, retrieved 20 September 2026 from https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/input.tsx . The component retains prop forwarding, data-slot, focus and invalid states; styling uses existing T2Q brand tokens and 44 px controls. No template branding or restrictive application code was copied.
- PDF.js assets are generated before dev/build from `pdfjs-dist@6.3.289`; its matching worker and font/CMap/WASM resources remain on the application origin. Reference APIs: https://mozilla.github.io/pdf.js/examples/ and https://konvajs.org/docs/sandbox/Relative_Pointer_Position.html . Uppy core manages PDF file restrictions and selection state (https://uppy.io/docs/uppy/).
- React Email HTML and plain-text rendering follows https://react.email/docs/utilities/render . Existing Resend transport, replies and attachments are preserved. Live delivery and physical Outlook/Gmail rendering require a release smoke test.
