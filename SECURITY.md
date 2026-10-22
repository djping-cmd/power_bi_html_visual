# Security

## Threat model

The HTML this visual renders comes from a DAX measure or column. Whoever can
change the report, or the data feeding that column, controls the markup. The
visual treats all of it as untrusted. Its goals:

1. **No script execution** inside the visual's frame.
2. **No network access.** Nothing can beacon out or exfiltrate data, unless
   *Allow external images* is on and the visual has been given the `WebAccess`
   privilege.
3. **No navigation or phishing** beyond Power BI's own `launchUrl` prompt for
   `http(s)`/`mailto` links, and none at all when *Allow hyperlinks* is off.
4. **Bounded rendering cost.**

The Power BI sandbox (a sandboxed iframe with a restrictive CSP and no
declared privileges) is a second layer. The visual does not rely on it.

## Controls

| Control | Where |
|---|---|
| DOMPurify sanitizing. Scripts, event handlers, iframes, objects, forms, `<link>`, `<meta>`, `<base>` and `<template>` are removed. The result is a DOM fragment and is never turned back into a string (no `innerHTML`, so no mXSS re-parse). | `src/sanitizer.ts` |
| URL attributes. `src`, `srcset`, `poster`, `background`, `href` and `xlink:href` keep only `#fragment` and `data:image/*` values. External image URLs are kept only when allowed. Every `srcset` value is removed unless external images are allowed, because one candidate can't vouch for the rest. | `scrubResourceAttributes` |
| Links. `href`/`xlink:href` on `<a>`, `<area>` and SVG `<a>` are always removed. If the URL is `http(s)` or `mailto` and links are allowed, it is moved to `data-pbi-link`. `target` is forbidden everywhere. `data-pbi-link` is forbidden in the input, so the HTML cannot forge it. Clicks re-check the scheme and the *Allow hyperlinks* setting before calling `host.launchUrl`. | `scrubLinkElement`, `Visual.onClick` |
| CSS. When external images are off, `<style>` blocks are re-parsed with the browser's CSS parser. `@import` rules and any declaration with a non-`data:image` / non-`#` `url()`, `image-set()` and similar are removed. Style attributes and SVG paint attributes (`fill`, `mask`, `filter`, ...) get the same treatment. Values containing CSS escapes are rejected. | `scrubStylesheet`, `isSafeCssValue` |
| Overlay containment. Each row is a containing block and stacking context, so `position: fixed` content cannot cover other rows or the rest of the visual. | `style/visual.less` |
| Size cap. At most 1000 rows (data reduction) and 2,000,000 characters per update. | `capabilities.json`, `src/visual.ts` |
| Dependencies. Only DOMPurify and Microsoft's formatting-model utilities are bundled. `npm audit` runs in CI. | `.github/workflows/ci.yml` |

## Audit log

### Initial review (October 2026)

An independent review fed payloads through the sanitizer in jsdom. It also ran
the packaged visual in headless Chromium inside a sandboxed iframe, recording
every outbound request and navigation. It found **no script execution path**.

Findings, all fixed with regression tests in `test/sanitizer.test.ts`:

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Medium | `data-pbi-link` written in the input HTML bypassed *Allow hyperlinks* and the scheme check. A transparent overlay could turn any click into a launch of a URL the attacker chose. | The attribute is forbidden in input. `onClick` re-validates the scheme and the setting. |
| 2 | Medium | CSS `url()`, `@import`, `@font-face` and SVG paint `url()` fetched external resources with external images off. Attribute selectors could leak other rows' values to a remote server. | CSS is re-parsed and scrubbed (see Controls). |
| 3 | Medium | `srcset="#a 1x, https://..."` passed the leading-`#` check. | `srcset` is removed unless external images are allowed. |
| 4 | Medium | With external images on, `<area href>` and SVG `<a xlink:href>` navigated the visual's frame, skipping `launchUrl`. | They are handled as links. `target` is forbidden. |
| 5 | Low | `position: fixed` content could cover the whole visual (UI redressing). | Each row is a containing block. |
| 6 | Low | A very large total input (about 4.5 million nodes) crashed the renderer. | 2M character cap with a notice. One sanitizer instance per update. |

After the fixes, the same Chromium tests showed zero outbound requests (apart
from the deliberate "external images on" case), no forged launches and no frame
navigation.

**Residual risk:** with *Allow hyperlinks* on (the default), HTML can still
style a link to look like anything inside its own row. Power BI's `launchUrl`
confirmation prompt is the backstop. If the HTML comes from data you don't
control, consider turning links off.

## Reporting

Please report issues privately to the repository owner instead of opening a
public issue.
