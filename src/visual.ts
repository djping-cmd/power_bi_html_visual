"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;
import DataView = powerbi.DataView;

import { VisualFormattingSettingsModel } from "./settings";
import { LINK_ATTRIBUTE, sanitizeToFragment } from "./sanitizer";
import { waitForResources } from "./resources";
import { extractHtmlValues } from "./data";

// Upper bound on how long export waits for images/fonts before we report
// rendering as finished anyway. Export never hangs on a broken image.
const RESOURCE_TIMEOUT_MS = 5000;

export class Visual implements IVisual {
    private host: IVisualHost;
    private events: IVisualEventService;
    private selectionManager: ISelectionManager;
    private root: HTMLElement;
    private viewport: HTMLElement;
    private content: HTMLElement;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    // Incremented on every update so a slow, superseded render never reports
    // completion for a newer one.
    private renderId = 0;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.selectionManager = options.host.createSelectionManager();
        this.formattingSettingsService = new FormattingSettingsService();

        this.root = options.element;
        this.root.classList.add("html-renderer");

        this.viewport = document.createElement("div");
        this.viewport.className = "html-renderer__viewport";
        this.content = document.createElement("div");
        this.content.className = "html-renderer__content";
        this.viewport.appendChild(this.content);
        this.root.appendChild(this.viewport);

        this.root.addEventListener("click", (event) => this.onClick(event));
        this.root.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                this.onClick(event);
            }
        });
        this.root.addEventListener("contextmenu", (event) => {
            this.selectionManager.showContextMenu({}, { x: event.clientX, y: event.clientY });
            event.preventDefault();
        });
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        const renderId = ++this.renderId;

        try {
            const dataView: DataView | undefined = options.dataViews?.[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel, dataView);

            this.applyBaseStyles();
            const hasContent = this.renderContent(dataView);
            this.root.classList.toggle("html-renderer--empty", !hasContent);

            waitForResources(this.content, RESOURCE_TIMEOUT_MS)
                .then(() => {
                    if (renderId !== this.renderId) {
                        return;
                    }
                    this.applyFit();
                    this.events.renderingFinished(options);
                })
                .catch((error) => {
                    if (renderId === this.renderId) {
                        this.events.renderingFailed(options, String(error));
                    }
                });
        } catch (error) {
            this.events.renderingFailed(options, String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    private applyBaseStyles(): void {
        const { textCard, layoutCard } = this.formattingSettings;
        const style = this.root.style;
        style.fontFamily = textCard.fontFamily.value;
        style.fontSize = `${textCard.fontSize.value}pt`;
        style.color = textCard.fontColor.value.value;
        style.backgroundColor = "";

        // High contrast: force the theme's colours for text, background and
        // links. HTML that sets its own colours explicitly still wins.
        const palette = this.host.colorPalette as ISandboxExtendedColorPalette;
        const highContrast = Boolean(palette?.isHighContrast);
        this.root.classList.toggle("html-renderer--high-contrast", highContrast);
        if (highContrast) {
            style.color = palette.foreground.value;
            style.backgroundColor = palette.background.value;
            style.setProperty("--html-renderer-link", palette.hyperlink.value);
        }

        this.content.style.padding = `${layoutCard.padding.value}px`;
        this.content.style.gap = `${layoutCard.gap.value}px`;
        this.content.dataset.arrangement = String(layoutCard.arrangement.value.value);
    }

    /** Renders every row's HTML. Returns false when there was nothing to show. */
    private renderContent(dataView: DataView | undefined): boolean {
        this.content.replaceChildren();

        const values = extractHtmlValues(dataView);
        const { securityCard, noDataCard } = this.formattingSettings;
        const sanitizeOptions = {
            allowExternalImages: securityCard.allowExternalImages.value,
            allowLinks: securityCard.allowLinks.value
        };

        for (const html of values) {
            const item = document.createElement("div");
            item.className = "html-renderer__item";
            item.appendChild(sanitizeToFragment(html, sanitizeOptions));
            makeLinksFocusable(item);
            this.content.appendChild(item);
        }

        if (values.length > 0) {
            return true;
        }

        const message = noDataCard.message.value;
        if (message) {
            const empty = document.createElement("div");
            empty.className = "html-renderer__message";
            empty.textContent = message;
            this.content.appendChild(empty);
        }
        return false;
    }

    /**
     * Scales content down (never up) so it fits the visual. A PDF page cannot
     * scroll, so this is what makes long HTML fully visible in exports.
     */
    private applyFit(): void {
        const mode = String(this.formattingSettings.layoutCard.fitMode.value.value);
        const content = this.content;

        content.style.transform = "";
        content.style.width = "";
        this.viewport.classList.toggle("html-renderer__viewport--scroll", mode === "none");
        if (mode === "none") {
            return;
        }

        const availableWidth = this.viewport.clientWidth;
        const availableHeight = this.viewport.clientHeight;
        const contentWidth = Math.max(content.scrollWidth, 1);
        const contentHeight = Math.max(content.scrollHeight, 1);

        let scale = availableWidth / contentWidth;
        if (mode === "both") {
            scale = Math.min(scale, availableHeight / contentHeight);
        }
        scale = Math.min(1, scale);

        if (scale < 1) {
            // Lay the content out at its natural width, then shrink it.
            content.style.width = `${contentWidth}px`;
            content.style.transform = `scale(${scale})`;
        }
    }

    private onClick(event: MouseEvent | KeyboardEvent): void {
        const target = event.target as Element | null;
        const link = target?.closest?.(`[${LINK_ATTRIBUTE}]`);
        if (link) {
            event.preventDefault();
            if (this.host.hostCapabilities?.allowInteractions === false) {
                return;
            }
            this.host.launchUrl(link.getAttribute(LINK_ATTRIBUTE));
        }
    }
}

/** Links lose their href during sanitizing, so make them keyboard-reachable again. */
function makeLinksFocusable(container: HTMLElement): void {
    container.querySelectorAll(`[${LINK_ATTRIBUTE}]`).forEach((link) => {
        link.setAttribute("tabindex", "0");
        link.setAttribute("role", "link");
    });
}
