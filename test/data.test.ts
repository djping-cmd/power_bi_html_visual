import { describe, expect, it } from "vitest";
import { extractHtmlValues } from "../src/data";

describe("extractHtmlValues", () => {
    it("returns the content column for every non-blank row", () => {
        const dataView = {
            metadata: { columns: [] },
            table: {
                columns: [
                    { displayName: "Region", roles: { granularity: true } },
                    { displayName: "Card", roles: { content: true } }
                ],
                rows: [["East", "<b>1</b>"], ["West", null], ["North", 3]]
            }
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(extractHtmlValues(dataView as any)).toEqual(["<b>1</b>", "3"]);
    });

    it("returns nothing without a content column", () => {
        expect(extractHtmlValues(undefined)).toEqual([]);
    });
});
