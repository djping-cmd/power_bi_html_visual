# HTML Renderer (PDF-safe) — Power BI custom visual

A Power BI custom visual that renders HTML returned by a DAX measure or column,
similar to *HTML Content*, *HTML Content (lite)* and *HTML Content (secure)*. It is
built to show correctly when a report is **exported to PDF or PowerPoint**.

## What it does

- Renders the HTML string from a measure or column. Optionally renders one block
  per row of a **Granularity** column, stacked or wrapped.
- Supports HTML, `<style>` blocks, inline styles, inline **SVG** and
  `data:image/...` images.
- Sanitizes all markup with [DOMPurify](https://github.com/cure53/DOMPurify).
  Scripts, event handlers, iframes, forms, `<link>` and `<meta>` are removed.
  External images are blocked by default.
- Opens `http(s)` and `mailto` links through Power BI's `launchUrl`, so the
  report viewer gets the usual "open link" prompt.
- Right-clicking the visual opens the standard Power BI context menu.

### Why it works in PDF export

PDF and PowerPoint export render the report in a headless browser. Each visual
is captured as soon as it reports that it has finished rendering. This visual is
built for that process:

1. **Rendering events.** It calls `renderingStarted` at the start of each update.
   It calls `renderingFinished` only once the DOM is built, every `<img>` has
   loaded or failed, and web fonts are ready. If resources are still loading
   after 5 seconds, it reports finished anyway so the export never hangs.
   Stale updates never report completion for a newer one.
2. **No nested documents and no scripts.** Content is rendered straight into the
   visual's DOM, with no `<iframe>` and no executed JavaScript. Nothing needs to
   run after the snapshot is taken.
3. **No network dependency by default.** The visual declares no `WebAccess`
   privilege. Use inline SVG and `data:` URIs so content renders the same in
   Desktop, the Service and exports.
4. **Fit content.** A PDF page cannot scroll. Set **Format → Layout → Fit
   content** to *Shrink to fit visual*. The HTML is then scaled down so all of it
   appears on the exported page. *Shrink to fit width* only removes horizontal
   overflow.
5. **Backgrounds print.** `print-color-adjust: exact` keeps background colours.

### ⚠️ Read this first: certification and Service export

Microsoft's documentation states that the Power BI **Service** export to PDF and
PowerPoint (and subscriptions / the Export-to-File API) **renders only custom
visuals that are *certified***. Uncertified visuals, including ones deployed
through the organizational visuals store, appear as an empty or grey box. See
Microsoft's
[Export reports to PDF](https://learn.microsoft.com/en-us/power-bi/collaborate-share/end-user-pdf)
limitations.

What this means for you:

| Export path | Uncertified build of this visual |
|---|---|
| **Power BI Desktop → File → Export → Export to PDF** | Renders. The visual runs locally. |
| Power BI Service → Export → PDF / PowerPoint | Not rendered until the visual is certified |
| Subscriptions, Export-to-File REST API | Not rendered until the visual is certified |

This visual is written to meet the certification *technical* requirements:

- open source
- no `innerHTML` / `eval` (enforced by `eslint-plugin-powerbi-visuals`)
- no external network access
- rendering events
- context menu
- latest API

Certification also requires publishing to AppSource through Microsoft Partner
Center and passing Microsoft's review, which is outside this repository. See
[Certified Power BI visuals](https://learn.microsoft.com/en-us/power-bi/developer/visuals/power-bi-custom-visuals-certified).

## Using it

1. Build or download the `.pbiviz` file (see below).
2. In Power BI Desktop: **Visualizations pane → … → Import a visual from a file**.
3. Add a measure that returns HTML to **HTML content**. Optionally add a column to
   **Granularity**.
4. Set **Format → Layout → Fit content → Shrink to fit visual** for pages you
   will export.

See [`samples/measures.dax`](samples/measures.dax) for example measures:

- a KPI card
- a table built with `CONCATENATEX`
- an SVG sparkline
- a base64 image

### Format options

| Card | Option | Notes |
|---|---|---|
| Layout | Fit content | None (scroll) / Shrink to fit width / Shrink to fit visual |
| Layout | Multiple rows | Stack vertically or flow (wrap) when Granularity is used |
| Layout | Gap, Padding | Pixels |
| Default text | Font, size, colour | Inherited by HTML that doesn't set its own |
| Content security | Allow external images | Off by default. See below. |
| Content security | Allow hyperlinks | On by default |
| No data | Message | Shown when the measure is blank |

### Authoring tips for reliable exports

- Prefer **inline SVG** or `data:image/png;base64,...` over image URLs.
- Use fonts that exist on the export machine, such as Segoe UI, Arial or Calibri.
  Web fonts cannot be downloaded.
- Avoid `position: fixed`, animations and transitions. Only the final static
  frame is captured.
- Keep each visual's HTML under a few hundred KB. Very large strings slow down
  both DAX and rendering.

### External images

External `http(s)` images only work if the visual declares the `WebAccess`
privilege. To enable them:

1. Add the privilege to `capabilities.json`:
   ```json
   "privileges": [{ "name": "WebAccess", "essential": false, "parameters": ["https://your.cdn.example.com"] }]
   ```
2. Turn on **Allow external images**.

Tenant admins can block this privilege. External images may also not finish
loading before the export snapshot, so data URIs are strongly recommended.

## Development

Requires Node.js 18+.

```bash
npm install
npm run lint        # eslint incl. Power BI certification rules
npm run typecheck
npm test            # sanitizer + data extraction unit tests (vitest/jsdom)
npm run package     # builds dist/*.pbiviz
npm start           # dev server for the Power BI "Developer visual"
```

### Project layout

```
capabilities.json   data roles (HTML content, Granularity) and format properties
pbiviz.json         visual metadata
src/visual.ts       IVisual: render, fit-to-visual scaling, rendering events, links
src/sanitizer.ts    DOMPurify configuration and URL policy
src/resources.ts    waits for images/fonts before renderingFinished
src/data.ts         reads HTML values from the table data view
src/settings.ts     format pane model
style/visual.less   layout and print styles
samples/            example DAX measures
test/               unit tests
```
