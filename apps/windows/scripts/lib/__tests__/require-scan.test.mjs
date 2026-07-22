import { describe, expect, it } from 'bun:test';
import { findDisallowedRequires } from '../require-scan.mjs';

// Regression coverage for the preload self-containment gate hardening
// (docs/bugs/windows-ui-invisible-2026-07-10.md): the gate must (a) not
// false-fail on the literal text `require(...)` sitting inside a string or
// comment, and (b) fail closed on any require() call whose specifier isn't
// a plain string literal — Electron's sandboxed preload only survives a
// bare `require("electron")`.

describe('findDisallowedRequires', () => {
	it('passes a bundle that only requires "electron"', () => {
		const source = `"use strict";\nconst { contextBridge, ipcRenderer } = require("electron");\ncontextBridge.exposeInMainWorld("x", {});\n`;
		expect(findDisallowedRequires(source)).toEqual([]);
	});

	it('flags a relative chunk require as disallowed', () => {
		const source = `const { CHANNELS } = require("./chunk-abc123.cjs");\nrequire("electron");\n`;
		expect(findDisallowedRequires(source)).toEqual(['./chunk-abc123.cjs']);
	});

	it('fails closed on a template-literal specifier require(`electron`)', () => {
		const source = 'const electron = require(`electron`);\n';
		expect(findDisallowedRequires(source)).toEqual(['<non-literal>']);
	});

	it('fails closed on a non-literal (variable) specifier require(x)', () => {
		const source = 'const mod = "electron";\nconst electron = require(mod);\n';
		expect(findDisallowedRequires(source)).toEqual(['<non-literal>']);
	});

	it('fails closed on a concatenated specifier require("elec" + "tron")', () => {
		const source = 'const electron = require("elec" + "tron");\n';
		expect(findDisallowedRequires(source)).toEqual(['<non-literal>']);
	});

	it('does not false-fail on require(...) text inside a string literal', () => {
		const source = 'console.log("call require(\\"./x.cjs\\") to load it");\nrequire("electron");\n';
		expect(findDisallowedRequires(source)).toEqual([]);
	});

	it('does not false-fail on require(...) text inside a line comment', () => {
		const source = '// require("./x.cjs") — old approach, no longer used\nrequire("electron");\n';
		expect(findDisallowedRequires(source)).toEqual([]);
	});

	it('does not false-fail on require(...) text inside a block comment', () => {
		const source = '/* require("./x.cjs") is not allowed here */\nrequire("electron");\n';
		expect(findDisallowedRequires(source)).toEqual([]);
	});

	it('does not match require as a suffix/prefix of another identifier', () => {
		const source = 'function myRequire() {}\nconst required = true;\nrequire("electron");\n';
		expect(findDisallowedRequires(source)).toEqual([]);
	});

	it('handles whitespace and newlines around the call', () => {
		const source = 'require(\n\t"electron"\n);\n';
		expect(findDisallowedRequires(source)).toEqual([]);
	});

	// Kimi review F1 — regex-literal state.
	it('does not false-fail on require(...) text sitting inside a regex literal', () => {
		// The `require("./x.cjs")` here is inside a regex literal (a value
		// assigned after `=`, so the `/` starts a regex, not division), so it
		// must NOT be parsed as a call. The real require("electron") after it
		// still must be found.
		const source = 'const re = /require\\("\\.\\/x\\.cjs"\\)/g;\nrequire("electron");\n';
		expect(findDisallowedRequires(source)).toEqual([]);
	});

	it('disambiguates division from regex without swallowing a later real require', () => {
		// `b / c` and `e / re /` are divisions (b and e are values), so no
		// regex literal should consume the trailing require("./x.cjs").
		const source = 'const a = b / c;\nconst d = e / re / f;\nrequire("./x.cjs");\n';
		expect(findDisallowedRequires(source)).toEqual(['./x.cjs']);
	});

	it('treats a regex character class containing a slash as one regex literal (no false division)', () => {
		// The `/` inside `[/]` does not terminate the regex; the whole
		// `/[/]require("x")/` is one regex literal, so the require text in it
		// is not a call.
		const source = 'const re = /[/]require\\("x"\\)/;\nrequire("electron");\n';
		expect(findDisallowedRequires(source)).toEqual([]);
	});

	// Kimi review F2 — template-interpolation scanning.
	it('detects a real require("./x.cjs") hidden inside a template-literal interpolation (fail-closed)', () => {
		const source = 'const s = `prefix ${require("./x.cjs")} suffix`;\n';
		expect(findDisallowedRequires(source)).toEqual(['./x.cjs']);
	});

	it('detects a real require inside a nested template-literal interpolation', () => {
		const source = 'const s = `${`${require("./y.cjs")}`}`;\n';
		expect(findDisallowedRequires(source)).toEqual(['./y.cjs']);
	});

	it('scans interpolation expressions with braces without prematurely closing the interpolation', () => {
		// The object literal braces inside `${ ... }` must not end the
		// interpolation early; the require after them is still inside it.
		const source = 'const s = `${ ({a: 1}, require("./z.cjs")) }`;\n';
		expect(findDisallowedRequires(source)).toEqual(['./z.cjs']);
	});

	it('still allows a bare require("electron") appearing inside an interpolation', () => {
		const source = 'const s = `${require("electron")}`;\n';
		expect(findDisallowedRequires(source)).toEqual([]);
	});

	it('does not treat template TEXT (outside ${}) require(...) text as a call', () => {
		// Here the require text is template literal text, not an
		// interpolation expression, so it is not code and must be ignored.
		const source = 'const s = `see require("./x.cjs") in the docs`;\nrequire("electron");\n';
		expect(findDisallowedRequires(source)).toEqual([]);
	});
});
