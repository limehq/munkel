// Tokenizing scanner backing scripts/check-preload-selfcontained.mjs.
//
// Finds real, top-level `require(...)` call specifiers in a CommonJS bundle,
// hardened on several axes:
//
//  (a) False positives: a naive regex over the raw text also matches the
//      literal text `require("./x")` when it appears inside a string
//      literal, a template literal, a comment, or a regex literal (none of
//      which are actual runtime calls). This scanner walks the source
//      tracking string / template / comment / regex-literal state so only
//      require() calls in real code are reported.
//
//  (b) False negatives: a regex that only matches `require("literal")`
//      silently ignores `require(`electron`)` (template literal) and
//      `require(someVar)` (non-literal specifier). Electron's sandboxed
//      preload can only survive a bare `require("electron")` — any other
//      shape must be treated as disallowed. This scanner reports every
//      non-string-literal call argument as the NON_LITERAL sentinel so the
//      caller fails closed instead of silently passing. It also descends
//      into template-literal interpolations (`${ ... }`) as real code, so a
//      genuine `require("./x.cjs")` hidden inside an interpolation is still
//      caught (fail-closed) rather than skipped.
//
// The `/` disambiguation (Kimi review F1) is context-sensitive: after a
// *value* (identifier, number, string/template/regex literal, `)`/`]`) a `/`
// is division; otherwise (after an operator, `(`, `,`, `=`, `return`, etc.)
// it starts a regex literal. Getting this right matters because mis-reading a
// division as a regex-start could swallow following code — including a real
// `require` — and produce a false negative; mis-reading a regex as division
// could re-scan `require("…")` text inside the regex as a call (false
// positive). This is exactly the P0 the gate guards
// (docs/bugs/windows-ui-invisible-2026-07-10.md), so correctness is worth it.
const NON_LITERAL = Symbol('non-literal-require-specifier');

const isIdentChar = (ch) => ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
const isSpace = (ch) => ch !== undefined && /\s/.test(ch);

// Keywords after which a `/` starts a regex literal, not division. A plain
// identifier / value keyword (`this`, `true`, a variable) is a value, so a
// following `/` is division; these control keywords are not values, so a
// following `/` begins a regex.
const REGEX_PRECEDING_KEYWORDS = new Set([
	'return',
	'typeof',
	'instanceof',
	'in',
	'of',
	'new',
	'delete',
	'void',
	'do',
	'else',
	'yield',
	'await',
	'throw',
	'case',
]);

/**
 * Returns an array whose entries are either the string specifier of a
 * literal `require("...")` / `require('...')` call, or the `NON_LITERAL`
 * sentinel for any other call shape (template literal, identifier,
 * expression, concatenation, etc.).
 */
export function scanRequireSpecifiers(source) {
	const specifiers = [];
	const len = source.length;
	let i = 0;

	// Frame stack for template-literal nesting. Each frame is either:
	//   { type: 'template' } — reading template *text* (between backticks,
	//     outside a `${}` interpolation), or
	//   { type: 'interp', depth: n } — inside a `${ ... }` interpolation,
	//     where `depth` counts `{`…`}` pairs opened since the `${` so a
	//     literal brace in the expression doesn't prematurely close it.
	// Code context = the stack is empty (top level) OR the top frame is an
	// 'interp'. That's the only context in which strings, comments, regex
	// literals, and require() calls are recognized.
	const stack = [];

	// Regex-vs-division disambiguation: true when the previously scanned
	// token was a *value* (so a following `/` is division). Reset to false
	// after operators / punctuation / control keywords (so a following `/`
	// starts a regex literal).
	let prevIsValue = false;

	const topFrame = () => (stack.length > 0 ? stack[stack.length - 1] : undefined);
	const inTemplateText = () => topFrame()?.type === 'template';

	while (i < len) {
		// --- Template literal TEXT context ------------------------------
		if (inTemplateText()) {
			const ch = source[i];
			if (ch === '\\') {
				i += 2; // escaped char (e.g. \` or \$) — skip both
				continue;
			}
			if (ch === '`') {
				stack.pop(); // end of template literal
				prevIsValue = true; // a template literal is a value
				i++;
				continue;
			}
			if (ch === '$' && source[i + 1] === '{') {
				stack.push({ type: 'interp', depth: 0 }); // enter interpolation as code
				prevIsValue = false; // start of an expression
				i += 2;
				continue;
			}
			i++; // ordinary template text
			continue;
		}

		// --- Code context (top level or inside a `${}` interpolation) ----
		const ch = source[i];
		const next = source[i + 1];

		// Line comment.
		if (ch === '/' && next === '/') {
			i += 2;
			while (i < len && source[i] !== '\n') i++;
			continue;
		}

		// Block comment.
		if (ch === '/' && next === '*') {
			i += 2;
			while (i < len && !(source[i] === '*' && source[i + 1] === '/')) i++;
			i += 2;
			continue;
		}

		// Regex literal (only when a `/` here can't be division).
		if (ch === '/' && !prevIsValue) {
			i++;
			let inClass = false; // inside a [...] character class, where `/` is literal
			while (i < len) {
				const c = source[i];
				if (c === '\\') {
					i += 2; // escaped char inside the regex
					continue;
				}
				if (c === '\n') break; // unterminated regex — bail defensively
				if (c === '[') inClass = true;
				else if (c === ']') inClass = false;
				else if (c === '/' && !inClass) {
					i++; // consume closing slash
					break;
				}
				i++;
			}
			while (isIdentChar(source[i])) i++; // regex flags (g, i, m, …)
			prevIsValue = true; // a regex literal is a value
			continue;
		}

		// Division (a `/` after a value).
		if (ch === '/') {
			i++;
			prevIsValue = false;
			continue;
		}

		// String literal — skip entirely, respecting backslash escapes.
		if (ch === '"' || ch === "'") {
			const quote = ch;
			i++;
			while (i < len && source[i] !== quote) {
				i += source[i] === '\\' ? 2 : 1;
			}
			i++;
			prevIsValue = true;
			continue;
		}

		// Backtick — enter template-literal text context.
		if (ch === '`') {
			stack.push({ type: 'template' });
			i++;
			continue;
		}

		// Brace tracking so an interpolation's `${ ... }` closes at the right
		// `}` even when the expression itself contains object/block braces.
		if (ch === '{') {
			const top = topFrame();
			if (top?.type === 'interp') top.depth++;
			prevIsValue = false;
			i++;
			continue;
		}
		if (ch === '}') {
			const top = topFrame();
			if (top?.type === 'interp') {
				if (top.depth === 0) {
					stack.pop(); // end interpolation — back to template text
					i++;
					continue;
				}
				top.depth--;
			}
			prevIsValue = false;
			i++;
			continue;
		}

		// Identifier / keyword / number — including a possible require() call.
		if (isIdentChar(ch)) {
			let j = i;
			while (isIdentChar(source[j])) j++;
			const word = source.slice(i, j);

			if (word === 'require') {
				let k = j;
				while (isSpace(source[k])) k++;
				if (source[k] === '(') {
					k++;
					while (isSpace(source[k])) k++;

					if (source[k] === '"' || source[k] === "'") {
						const quote = source[k];
						let m = k + 1;
						let value = '';
						while (m < len && source[m] !== quote) {
							if (source[m] === '\\') {
								value += source[m + 1];
								m += 2;
								continue;
							}
							value += source[m];
							m++;
						}
						m++; // consume closing quote
						let p = m;
						while (isSpace(source[p])) p++;

						if (source[p] === ')') {
							// A bare `require("literal")` — the only statically
							// known specifier shape.
							specifiers.push(value);
							prevIsValue = true;
							i = p + 1;
							continue;
						}
						// Something follows the string before the `)` (e.g.
						// `require("a" + b)`) — not a static literal call.
						specifiers.push(NON_LITERAL);
						prevIsValue = false;
						i = m;
						continue;
					}

					// `require(\`tmpl\`)`, `require(ident)`, `require(expr)` —
					// non-literal, fail closed.
					specifiers.push(NON_LITERAL);
					prevIsValue = false;
					i = k; // resume scanning the argument expression as code
					continue;
				}
				// `require` used as a bare identifier, not a call.
			}

			// Ordinary identifier / keyword / number.
			prevIsValue = !REGEX_PRECEDING_KEYWORDS.has(word);
			i = j;
			continue;
		}

		// Whitespace — carries prevIsValue through untouched.
		if (isSpace(ch)) {
			i++;
			continue;
		}

		// Any other punctuation / operator. `)` and `]` end a value; the rest
		// (`=`, `(`, `,`, `+`, `:`, `?`, `;`, `!`, …) are operator context, so
		// a following `/` starts a regex.
		prevIsValue = ch === ')' || ch === ']';
		i++;
	}

	return specifiers;
}

/**
 * Returns the disallowed require() specifiers in `source`: anything other
 * than an exact string-literal match in `allowed`. Non-literal call shapes
 * (template literals, variables, expressions) are always disallowed —
 * represented by the human-readable `'<non-literal>'` string.
 */
export function findDisallowedRequires(source, allowed = ['electron']) {
	return scanRequireSpecifiers(source)
		.filter((specifier) => !allowed.includes(specifier))
		.map((specifier) => (specifier === NON_LITERAL ? '<non-literal>' : specifier));
}
