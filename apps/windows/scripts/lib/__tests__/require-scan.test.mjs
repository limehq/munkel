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
});
