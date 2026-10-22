import { describe, expect, it } from "vitest";
import { LINK_ATTRIBUTE, isSafeCssValue, sanitizeToFragment } from "../src/sanitizer";

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

    // Regression tests for the security audit findings.

    it("ignores data-pbi-link written in the input HTML", () => {
        const html = "<div id='forged' data-pbi-link='javascript:alert(1)'>x</div><a id='real' data-pbi-link='https://evil.example' href='https://ok.example'>ok</a>";
        const host = render(html);
        expect(host.querySelector("#forged")?.hasAttribute(LINK_ATTRIBUTE)).toBe(false);
        expect(host.querySelector("#real")?.getAttribute(LINK_ATTRIBUTE)).toBe("https://ok.example");
        expect(render(html, { ...defaults, allowLinks: false }).querySelector(`[${LINK_ATTRIBUTE}]`)).toBeNull();
    });

    it("checks every srcset candidate", () => {
        const host = render("<img srcset='#a 0.5x, https://evil.example/x.png 1x'><picture><source srcset='#a 1x, https://evil.example/y.png 2x'></picture>");
        expect(host.querySelectorAll("[srcset]").length).toBe(0);
    });

    it("treats area and SVG anchor hrefs as links, even with external images on", () => {
        const options = { allowExternalImages: true, allowLinks: false };
        const host = render("<map name='m'><area id='area' href='https://evil.example' target='_top'></map><svg><a id='svga' xlink:href='https://evil.example'><rect/></a></svg>", options);
        for (const id of ["#area", "#svga"]) {
            const el = host.querySelector(id);
            expect(el?.hasAttribute("href")).toBe(false);
            expect(el?.hasAttribute("xlink:href")).toBe(false);
            expect(el?.hasAttribute(LINK_ATTRIBUTE)).toBe(false);
        }
        expect(host.querySelector("[target]")).toBeNull();
    });

    it("keeps safe SVG presentation urls and removes external ones", () => {
        const host = render("<svg><rect id='ok' fill='url(#g)'/><rect id='bad' fill='url(https://evil.example/f.svg#g)' mask='url(https://evil.example/m.svg#m)'/></svg>");
        expect(host.querySelector("#ok")?.getAttribute("fill")).toBe("url(#g)");
        expect(host.querySelector("#bad")?.hasAttribute("fill")).toBe(false);
        expect(host.querySelector("#bad")?.hasAttribute("mask")).toBe(false);
    });

    it("removes external urls from style attributes and style blocks", () => {
        const host = render("<style>@import url(https://evil.example/i.css); .a{color:red;background:url(https://evil.example/b.png)}</style><div class='a' style='color:blue;background-image:url(https://evil.example/c.png)'>x</div>");
        const css = host.querySelector("style")?.textContent ?? "";
        expect(css).not.toContain("evil.example");
        expect(css).toContain("color: red");
        const style = host.querySelector(".a")?.getAttribute("style") ?? "";
        expect(style).not.toContain("evil.example");
        expect(style).toContain("color: blue");
    });

    it("leaves CSS untouched when external images are allowed", () => {
        const host = render("<div style='background-image:url(https://cdn.example/c.png)'>x</div>", { ...defaults, allowExternalImages: true });
        expect(host.querySelector("div")?.getAttribute("style")).toContain("cdn.example");
    });
});

describe("isSafeCssValue", () => {
    it.each([
        ["red", true],
        ["url(#grad)", true],
        ['url("data:image/png;base64,AAAA")', true],
        ["calc(100% - 4px)", true],
        ["url(https://evil.example/x.png)", false],
        ['image-set("https://evil.example/x.png" 1x)', false],
        ["u\\72l(https://evil.example/x.png)", false],
        ['url("data:image/png,x\\") url(https://evil.example/x)', false],
        ["url(//evil.example/x.png)", false]
    ])("%s -> %s", (value, expected) => {
        expect(isSafeCssValue(value)).toBe(expected);
    });
});
