# Power BI certification readiness

Certification is what allows the Power BI **Service** (Export to PDF and
PowerPoint, subscriptions, the Export-to-File API) to render this visual.
Power BI Desktop export works without it.

Requirements follow Microsoft's
[Certified Power BI visuals](https://learn.microsoft.com/en-us/power-bi/developer/visuals/power-bi-custom-visuals-certified)
page. Re-check it before submitting, because requirements change.

## Code requirements

| Requirement | Status |
|---|---|
| Repository contains a single visual | ✅ |
| `.gitignore`, `pbiviz.json`, `package.json`, `package-lock.json`, `tsconfig.json` and `capabilities.json` present | ✅ |
| `node_modules`, `.tmp` and `dist` not committed | ✅ (`.gitignore`) |
| `typescript`, `eslint` and `eslint-plugin-powerbi-visuals` installed, with a lint script | ✅ `npm run lint` |
| `npm install` succeeds | ✅ |
| `pbiviz package` succeeds | ✅ |
| `npm audit` returns no high or moderate warnings | ✅ 0 vulnerabilities. `powerbi-visuals-tools` is installed globally, not in `package.json`, because its own dependency tree currently fails audit. |
| ESLint with the Power BI config: no errors | ✅ |
| `pbiviz package --certification-audit` (no unsafe `fetch`, XHR or `eval`) | ✅ |
| Rendering Events API (`renderingStarted` / `Finished` / `Failed`) | ✅ |
| Safe DOM handling: user data sanitized, no `innerHTML` | ✅ DOMPurify, DOM fragments only. See [SECURITY.md](SECURITY.md). |
| No access to external services or resources | ✅ `privileges: []`. Keep it empty in the certified build. Don't add `WebAccess`. |
| Latest API version | ✅ `powerbi-visuals-api` 5.11.1 |
| Custom icon and metadata (name, description, support URL, author) | ✅ Review the wording before submitting. |

## Recommended features (`pbiviz package` warnings)

| Feature | Status |
|---|---|
| Rendering events, context menu, allow interactions | ✅ |
| Keyboard navigation (`supportsKeyboardFocus`) | ✅ Links are focusable and open with Enter. |
| High contrast | ✅ Uses the theme's foreground, background and hyperlink colours. |
| Landing page | ✅ |
| Localization | ⏳ Optional. Add `stringResources/` and `displayNameKey`s if you need non-English UI. |
| Tooltips, highlight, selection across visuals, colour palette | ➖ Not applicable: the visual has no data points to select, highlight or colour. |

## Steps outside this repo (owner actions)

1. **Partner Center account** for StepStone, with Microsoft 365 / AppSource
   publishing enabled.
2. **Certification branch.** Create a `certification` branch whose source
   matches the submitted `.pbiviz` exactly. Give Microsoft's reviewers read
   access if the repo is private.
3. **AppSource offer.** Upload the `.pbiviz`, a sample `.pbix` that shows the
   visual, screenshots, the privacy policy and support URLs, and the
   description.
4. **Request certification** in Partner Center. Microsoft's review typically
   takes a few weeks. Every later version must be resubmitted, and is
   re-reviewed if certification is requested again.
5. After approval, the certified version is installed from AppSource. Reports
   should use the AppSource visual, not a file-imported copy, for Service
   export to render it.
