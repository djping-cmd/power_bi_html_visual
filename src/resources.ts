"use strict";

function imageSettled(image: HTMLImageElement): Promise<void> {
    if (image.complete) {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
    });
}

/**
 * Resolves once every image inside `container` has loaded (or failed) and web
 * fonts are ready, or after `timeoutMs`, whichever comes first.
 *
 * Power BI's PDF/PowerPoint export captures the visual as soon as it reports
 * renderingFinished, so reporting too early produces blank images in the file.
 */
export function waitForResources(container: HTMLElement, timeoutMs: number): Promise<void> {
    const pending: Promise<unknown>[] = Array.from(container.querySelectorAll("img")).map(imageSettled);

    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) {
        pending.push(fonts.ready);
    }

    const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
    // Two animation frames let layout settle before the fit calculation measures it.
    const allLoaded = Promise.all(pending).then(() => nextFrame()).then(() => nextFrame());

    return Promise.race([allLoaded, timeout]);
}

function nextFrame(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => resolve());
        } else {
            setTimeout(resolve, 0);
        }
    });
}
