import { describe, expect, it } from "vitest";
import { LINK_ATTRIBUTE, sanitizeToFragment } from "../src/sanitizer";

const defaults = { allowExternalImages: false, allowLinks: true };

function render(html: string, options = defaults): HTMLElement {
    const host = document.createElement("div");
    host.appendChild(sanitizeToFragment(html, options));
    return host;
}

describe("sanitizeToFragment", () => {
    it("keeps ordinary markup, inline styles and leading <style> blocks", () => {
        const host = render("<style>.kpi{color:red}</style><div class='kpi' style='font-weight:bold'>42</div>");
        expect(host.querySelector("style")?.textContent).toContain(".kpi");
        expect(host.querySelector(".kpi")?.getAttribute("style")).toContain("font-weight");
    });

    it("keeps inline SVG", () => {
        const host = render("<svg width='10' height='10'><rect width='10' height='10' fill='#f00'/></svg>");
        expect(host.querySelector("svg rect")).not.toBeNull();
    });

    it("removes scripts, event handlers and embedded documents", () => {
        const host = render("<img src='data:image/png;base64,AAAA' onerror='alert(1)'><script>alert(1)</script><iframe src='https://x'></iframe>");
        expect(host.querySelector("script")).toBeNull();
        expect(host.querySelector("iframe")).toBeNull();
        expect(host.querySelector("img")?.hasAttribute("onerror")).toBe(false);
    });

    it("keeps image data URIs and blocks external images by default", () => {
        const host = render("<img id='a' src='data:image/png;base64,AAAA'><img id='b' src='https://example.com/x.png'>");
        expect(host.querySelector("#a")?.getAttribute("src")).toMatch(/^data:image\/png/);
        expect(host.querySelector("#b")?.hasAttribute("src")).toBe(false);
    });

    it("keeps external images when allowed", () => {
        const host = render("<img src='https://example.com/x.png'>", { ...defaults, allowExternalImages: true });
        expect(host.querySelector("img")?.getAttribute("src")).toBe("https://example.com/x.png");
    });

    it("rewrites safe links to the launchUrl attribute and drops unsafe ones", () => {
        const host = render("<a id='ok' href='https://example.com' target='_blank'>ok</a><a id='bad' href='javascript:alert(1)'>bad</a>");
        const ok = host.querySelector("#ok");
        expect(ok?.getAttribute(LINK_ATTRIBUTE)).toBe("https://example.com");
        expect(ok?.hasAttribute("href")).toBe(false);
        expect(ok?.hasAttribute("target")).toBe(false);
        expect(host.querySelector("#bad")?.hasAttribute(LINK_ATTRIBUTE)).toBe(false);
    });

    it("drops links entirely when links are disabled", () => {
        const host = render("<a href='https://example.com'>x</a>", { ...defaults, allowLinks: false });
        expect(host.querySelector("a")?.hasAttribute(LINK_ATTRIBUTE)).toBe(false);
    });
});
