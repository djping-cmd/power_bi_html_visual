"use strict";

import DOMPurify from "dompurify";

export interface SanitizeOptions {
    allowExternalImages: boolean;
    allowLinks: boolean;
}

/** Attribute set on anchors that the visual should open through host.launchUrl. */
export const LINK_ATTRIBUTE = "data-pbi-link";

// Anything interactive, executable or able to pull in another document is
// removed. Power BI blocks most of it anyway, and none of it survives a PDF.
const FORBID_TAGS = [
    "script", "noscript", "iframe", "frame", "frameset", "object", "embed", "applet",
    "form", "input", "button", "textarea", "select", "option",
    "link", "meta", "base", "portal", "template"
];

const RESOURCE_ATTRIBUTES = ["src", "srcset", "poster", "background", "xlink:href", "href"];

const SAFE_LINK = /^(https?:|mailto:)/i;
const EXTERNAL_URL = /^\s*(https?:)?\/\//i;
// data: URIs are allowed only for images, so they cannot smuggle in HTML/JS.
const SAFE_DATA_URI = /^\s*data:image\/(png|gif|jpe?g|webp|bmp|svg\+xml)[;,]/i;

function isExternal(value: string): boolean {
    return EXTERNAL_URL.test(value);
}

function scrubResourceAttributes(node: Element, options: SanitizeOptions): void {
    const isAnchor = node.tagName.toLowerCase() === "a";

    for (const attr of RESOURCE_ATTRIBUTES) {
        const value = node.getAttribute(attr);
        if (value === null) {
            continue;
        }

        if (isAnchor && attr === "href") {
            node.removeAttribute("href");
            if (options.allowLinks && SAFE_LINK.test(value.trim())) {
                node.setAttribute(LINK_ATTRIBUTE, value.trim());
            }
            continue;
        }

        // In-document references (e.g. SVG <use href="#id">) and image data URIs are self-contained.
        if (value.trim().startsWith("#") || SAFE_DATA_URI.test(value)) {
            continue;
        }

        if (isExternal(value) && options.allowExternalImages) {
            continue;
        }

        node.removeAttribute(attr);
    }

    if (isAnchor) {
        node.removeAttribute("target");
    }
}

/**
 * Sanitizes an HTML string and returns a DOM fragment ready to be appended.
 * Never returns markup as a string, so the visual never assigns innerHTML.
 */
export function sanitizeToFragment(html: string, options: SanitizeOptions): DocumentFragment {
    const purify = DOMPurify(window);

    purify.addHook("afterSanitizeAttributes", (node) => {
        if (node instanceof Element) {
            scrubResourceAttributes(node, options);
        }
    });

    try {
        return purify.sanitize(html, {
            RETURN_DOM_FRAGMENT: true,
            // Keep leading <style> blocks, which DOMPurify would otherwise drop
            // when they appear before any body content.
            FORCE_BODY: true,
            ADD_TAGS: ["style"],
            FORBID_TAGS,
            FORBID_ATTR: ["srcdoc", "formaction", "action", "ping"],
            ALLOW_DATA_ATTR: true,
            ALLOW_UNKNOWN_PROTOCOLS: false
        });
    } finally {
        purify.removeAllHooks();
    }
}
