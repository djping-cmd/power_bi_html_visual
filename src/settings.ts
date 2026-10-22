"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

const fitModeItems: powerbi.IEnumMember[] = [
    { value: "none", displayName: "None (scroll)" },
    { value: "width", displayName: "Shrink to fit width" },
    { value: "both", displayName: "Shrink to fit visual" }
];

const arrangementItems: powerbi.IEnumMember[] = [
    { value: "stack", displayName: "Stack vertically" },
    { value: "flow", displayName: "Flow (wrap left to right)" }
];

class LayoutCard extends FormattingSettingsCard {
    // Exported PDFs cannot scroll, so "Shrink to fit visual" guarantees the
    // whole HTML block is visible on the printed page.
    fitMode = new formattingSettings.ItemDropdown({
        name: "fitMode",
        displayName: "Fit content",
        items: fitModeItems,
        value: fitModeItems[0]
    });

    arrangement = new formattingSettings.ItemDropdown({
        name: "arrangement",
        displayName: "Multiple rows",
        items: arrangementItems,
        value: arrangementItems[0]
    });

    gap = new formattingSettings.NumUpDown({
        name: "gap",
        displayName: "Gap between rows (px)",
        value: 0,
        options: { minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 } }
    });

    padding = new formattingSettings.NumUpDown({
        name: "padding",
        displayName: "Padding (px)",
        value: 0,
        options: { minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 } }
    });

    name: string = "layout";
    displayName: string = "Layout";
    slices: Array<FormattingSettingsSlice> = [this.fitMode, this.arrangement, this.gap, this.padding];
}

class TextCard extends FormattingSettingsCard {
    fontFamily = new formattingSettings.FontPicker({
        name: "fontFamily",
        displayName: "Default font",
        value: "Segoe UI, wf_segoe-ui_normal, helvetica, arial, sans-serif"
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Default text size",
        value: 12,
        options: { minValue: { type: powerbi.visuals.ValidatorType.Min, value: 6 } }
    });

    fontColor = new formattingSettings.ColorPicker({
        name: "fontColor",
        displayName: "Default text color",
        value: { value: "#252423" }
    });

    name: string = "text";
    displayName: string = "Default text";
    description: string = "Applies to HTML that does not set its own font or color.";
    slices: Array<FormattingSettingsSlice> = [this.fontFamily, this.fontSize, this.fontColor];
}

class SecurityCard extends FormattingSettingsCard {
    allowExternalImages = new formattingSettings.ToggleSwitch({
        name: "allowExternalImages",
        displayName: "Allow external images",
        description: "Keep http(s) image URLs. They are blocked by the Power BI sandbox unless the visual declares WebAccess, and may not load in time for PDF export. Prefer data: URIs or inline SVG.",
        value: false
    });

    allowLinks = new formattingSettings.ToggleSwitch({
        name: "allowLinks",
        displayName: "Allow hyperlinks",
        description: "Clicking an http(s) or mailto link asks Power BI to open it.",
        value: true
    });

    name: string = "security";
    displayName: string = "Content security";
    slices: Array<FormattingSettingsSlice> = [this.allowExternalImages, this.allowLinks];
}

class NoDataCard extends FormattingSettingsCard {
    message = new formattingSettings.TextInput({
        name: "message",
        displayName: "Message",
        placeholder: "Shown when the measure returns blank",
        value: ""
    });

    name: string = "noData";
    displayName: string = "No data";
    slices: Array<FormattingSettingsSlice> = [this.message];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    layoutCard = new LayoutCard();
    textCard = new TextCard();
    securityCard = new SecurityCard();
    noDataCard = new NoDataCard();

    cards = [this.layoutCard, this.textCard, this.securityCard, this.noDataCard];
}
