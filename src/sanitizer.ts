"use strict";

import DOMPurify from "dompurify";

export interface SanitizeOptions {
    allowExternalImages: boolean;
    allowLinks: boolean;
}

export interface Sanitizer {
    /** Returns a sanitized DOM fragment; markup is never returned as a string. */
    sanitize(html: string): DocumentFragment;
    dispose(): void;
}

/**
 * Attribute set on link elements that the visual opens through host.launchUrl.
 * It is forbidden in input HTML, so only the sanitizer itself can set it.
 */
export const LINK_ATTRIBUTE = "data-pbi-link";

// Anything interactive, executable or able to pull in another document is
// removed. Power BI blocks most of it anyway, and none of it survives a PDF.
const FORBID_TAGS = [
    "script", "noscript", "iframe", "frame", "frameset", "object", "embed", "applet",
    "form", "input", "button", "textarea", "select", "option",
    "link", "meta", "base", "portal", "template"
];

const LINK_TAGS = new Set(["a", "area"]);
const LINK_ATTRIBUTES = ["href", "xlink:href"];
// Attributes that load an image or media file.
const IMAGE_ATTRIBUTES = ["src", "srcset", "poster", "background"];
// Elements whose href points at an image rather than a navigation target.
const HREF_IMAGE_TAGS = new Set(["image", "feimage"]);
// SVG presentation attributes that accept url(...) references.
const CSS_URL_ATTRIBUTES = [
    "fill", "stroke", "filter", "mask", "clip-path",
    "marker-start", "marker-mid", "marker-end", "cursor"
];

const SAFE_LINK = /^(https?:|mailto:)/i;
const EXTERNAL_URL = /^\s*(https?:)?\/\//i;
// data: URIs are allowed only for images, so they cannot smuggle in HTML/JS.
const SAFE_DATA_URI = /^\s*data:image\/(png|gif|jpe?g|webp|bmp|svg\+xml)[;,]/i;
const SAFE_URL_PREFIX = String.raw`(?:#|data:image\/(?:png|gif|jpe?g|webp|bmp|svg\+xml)[;,])`;
const SAFE_CSS_URL = new RegExp(
    String.raw`url\(\s*(?:"${SAFE_URL_PREFIX}[^"]*"|'${SAFE_URL_PREFIX}[^']*'|${SAFE_URL_PREFIX}[^)\s]*)\s*\)`, "gi");
const CSS_RESOURCE_FUNCTION = /(url|image-set|image|cross-fade|element|src)\s*\(|@import/i;

export function isSafeLink(value: string | null | undefined): value is string {
    return typeof value === "string" && SAFE_LINK.test(value.trim());
}

function isSelfContained(value: string): boolean {
    return value.trim().startsWith("#") || SAFE_DATA_URI.test(value);
}

/**
 * True when a CSS value cannot fetch anything external: every url() is an
 * in-document reference or an image data URI. Backslashes are rejected because
 * CSS escapes (e.g. `u\72l(`) can spell url( in values the parser leaves raw.
 */
export function isSafeCssValue(value: string): boolean {
    if (value.includes("\\")) {
        return false;
    }
    return !CSS_RESOURCE_FUNCTION.test(value.replace(SAFE_CSS_URL, ""));
}

function scrubDeclarations(style: CSSStyleDeclaration): void {
    for (let i = style.length - 1; i >= 0; i--) {
        const property = style[i];
        if (!isSafeCssValue(style.getPropertyValue(property))) {
            style.removeProperty(property);
        }
    }
}

interface RuleContainer {
    cssRules: CSSRuleList;
    deleteRule(index: number): void;
}

type ScrubbableRule = CSSRule & { style?: CSSStyleDeclaration; cssRules?: CSSRuleList; selectorText?: string };

function scrubRules(container: RuleContainer): void {
    // CSSKeyframesRule.deleteRule takes a keyframe selector, not an index, so
    // unsafe keyframes are removed by deleting the whole @keyframes rule instead.
    const canDelete = !("findRule" in container);

    for (let i = container.cssRules.length - 1; i >= 0; i--) {
        const rule = container.cssRules[i] as ScrubbableRule;
        if (rule.type === CSSRule.IMPORT_RULE) {
            container.deleteRule(i);
            continue;
        }
        if (rule.style) {
            scrubDeclarations(rule.style);
        }
        if (rule.cssRules) {
            scrubRules(rule as unknown as RuleContainer);
        }
        // Safety net for rule types without a declaration block (e.g. @property).
        // Selectors are excluded: escaped class names like .md\:flex are harmless.
        const text = rule.selectorText ? rule.cssText.replace(rule.selectorText, "") : rule.cssText;
        if (canDelete && !isSafeCssValue(text)) {
            container.deleteRule(i);
        }
    }
}

/** Re-serializes a stylesheet through the browser's CSS parser with external URLs removed. */
export function scrubStylesheet(css: string): string {
    try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        scrubRules(sheet);
        return Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
    } catch {
        // No constructable stylesheets: keep the CSS only if it is plainly safe.
        return isSafeCssValue(css) ? css : "";
    }
}

function scrubLinkElement(node: Element, options: SanitizeOptions): void {
    for (const attr of LINK_ATTRIBUTES) {
        const value = node.getAttribute(attr);
        if (value === null) {
            continue;
        }
        node.removeAttribute(attr);
        if (options.allowLinks && isSafeLink(value) && !node.hasAttribute(LINK_ATTRIBUTE)) {
            node.setAttribute(LINK_ATTRIBUTE, value.trim());
        }
    }
}

function scrubResourceAttributes(node: Element, options: SanitizeOptions): void {
    const tag = node.tagName.toLowerCase();

    if (LINK_TAGS.has(tag)) {
        scrubLinkElement(node, options);
    }

    for (const attr of [...IMAGE_ATTRIBUTES, ...LINK_ATTRIBUTES]) {
        const value = node.getAttribute(attr);
        if (value === null) {
            continue;
        }
        const isImageAttribute = IMAGE_ATTRIBUTES.includes(attr) || HREF_IMAGE_TAGS.has(tag);

        // srcset is a list of candidates, so a leading "#" or data: proves nothing.
        if (attr !== "srcset" && isSelfContained(value)) {
            continue;
        }
        if (isImageAttribute && options.allowExternalImages && EXTERNAL_URL.test(value)) {
            continue;
        }
        if (attr === "srcset" && options.allowExternalImages) {
            continue;
        }
        node.removeAttribute(attr);
    }

    if (!options.allowExternalImages) {
        for (const attr of CSS_URL_ATTRIBUTES) {
            const value = node.getAttribute(attr);
            if (value !== null && !isSafeCssValue(value)) {
                node.removeAttribute(attr);
            }
        }
        if (node.hasAttribute("style")) {
            const style = (node as HTMLElement).style;
            if (style) {
                scrubDeclarations(style);
                node.setAttribute("style", style.cssText);
            } else if (!isSafeCssValue(node.getAttribute("style"))) {
                node.removeAttribute("style");
            }
        }
    }
}

export function createSanitizer(options: SanitizeOptions): Sanitizer {
    const purify = DOMPurify(window);
    if (!purify.isSupported) {
        throw new Error("HTML sanitizer is not supported in this host.");
    }

    purify.addHook("afterSanitizeAttributes", (node) => {
        if (node instanceof Element) {
            scrubResourceAttributes(node, options);
        }
    });

    if (!options.allowExternalImages) {
        purify.addHook("afterSanitizeElements", (node) => {
            if (node instanceof Element && node.tagName.toLowerCase() === "style") {
                node.textContent = scrubStylesheet(node.textContent ?? "");
            }
        });
    }

    return {
        sanitize(html: string): DocumentFragment {
            return purify.sanitize(html, {
                RETURN_DOM_FRAGMENT: true,
                // Keep leading <style> blocks, which DOMPurify would otherwise drop
                // when they appear before any body content.
                FORCE_BODY: true,
                ADD_TAGS: ["style"],
                FORBID_TAGS,
                FORBID_ATTR: ["srcdoc", "formaction", "action", "ping", "target", LINK_ATTRIBUTE],
                ALLOW_DATA_ATTR: true,
                ALLOW_UNKNOWN_PROTOCOLS: false
            });
        },
        dispose(): void {
            purify.removeAllHooks();
        }
    };
}

/** Convenience wrapper for sanitizing a single string. */
export function sanitizeToFragment(html: string, options: SanitizeOptions): DocumentFragment {
    const sanitizer = createSanitizer(options);
    try {
        return sanitizer.sanitize(html);
    } finally {
        sanitizer.dispose();
    }
}
