import { describe, expect, test } from "bun:test";
import { parsePesewas } from "./money-input";

describe("GHS entry and display", () => {
	test("preserves pesewas without decimal multiplication", () => {
		expect(parsePesewas("0.01")).toBe(1);
		expect(parsePesewas("0.29")).toBe(29);
		expect(parsePesewas("1.1")).toBe(110);
		expect(parsePesewas("24200.00")).toBe(2420000);
	});
	test("rejects invalid precision, zero, negatives and exponential notation", () => {
		for (const value of ["0", "-2", "1.001", "1e3", "NaN", "Infinity", "1,200", "10000000000.01"])
			expect(() => parsePesewas(value)).toThrow();
	});
});
