"use strict";

import powerbi from "powerbi-visuals-api";

import DataView = powerbi.DataView;

/** Pulls the HTML strings for the "content" role out of the table data view. */
export function extractHtmlValues(dataView: DataView | undefined): string[] {
    const table = dataView?.table;
    if (!table) {
        return [];
    }

    const columnIndex = table.columns.findIndex((column) => column.roles?.["content"]);
    if (columnIndex < 0) {
        return [];
    }

    const values: string[] = [];
    for (const row of table.rows ?? []) {
        const value = row[columnIndex];
        if (value === null || value === undefined || value === "") {
            continue;
        }
        values.push(String(value));
    }
    return values;
}
