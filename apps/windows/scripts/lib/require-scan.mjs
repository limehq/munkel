// Tokenizing scanner backing scripts/check-preload-selfcontained.mjs.
//
// Finds real, top-level `require(...)` call specifiers in a CommonJS bundle,
// hardened on two axes:
//
//  (a) False positives: a naive regex over the raw text also matches the
//      literal text `require("./x")` when it appears inside a string
//      literal or a comment (not an actual runtime call). This scanner
//      walks the source tracking string/template-literal/comment state so
//      only require() calls in real code are reported.
//
//  (b) False negatives: a regex that only matches `require("literal")`
//      silently ignores `require(`electron`)` (template literal) and
//      `require(someVar)` (non-literal specifier). Electron's sandboxed
//      preload can only survive a bare `require("electron")` — any other
//      shape must be treated as disallowed. This scanner reports every
//      non-string-literal call argument as the NON_LITERAL sentinel so the
//      caller fails closed instead of silently passing.
const NON_LITERAL = Symbol('non-literal-require-specifier');

const isIdentChar = (ch) => ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
const isSpace = (ch) => ch !== undefined && /\s/.test(ch);

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

	while (i < len) {
		const ch = source[i];
		const next = source[i + 1];

		// Line comment — skip to end of line.
		if (ch === '/' && next === '/') {
			i += 2;
			while (i < len && source[i] !== '\n') i++;
			continue;
		}

		// Block comment — skip to closing `*/`.
		if (ch === '/' && next === '*') {
			i += 2;
			while (i < len && !(source[i] === '*' && source[i + 1] === '/')) i++;
			i += 2;
			continue;
		}

		// String literal — skip entirely, respecting backslash escapes, so
		// nothing inside ever gets re-examined as code.
		if (ch === '"' || ch === "'") {
			const quote = ch;
			i++;
			while (i < len && source[i] !== quote) {
				i += source[i] === '\\' ? 2 : 1;
			}
			i++;
			continue;
		}

		// Template literal — skip entirely (nested `${}` expressions are not
		// evaluated as code by this scanner; a real preload bundle never
		// needs a require() call written inside a template interpolation,
		// and any `require(\`...\`)` call is caught below as non-literal
		// before we would ever reach this branch for its own backticks).
		if (ch === '`') {
			i++;
			while (i < len && source[i] !== '`') {
				i += source[i] === '\\' ? 2 : 1;
			}
			i++;
			continue;
		}

		// Candidate `require(` token — require a word boundary on both sides
		// so `myRequire(` or `required(` don't false-match.
		if (ch === 'r' && source.startsWith('require', i) && !isIdentChar(source[i - 1]) && !isIdentChar(source[i + 7])) {
			let j = i + 7;
			while (isSpace(source[j])) j++;

			if (source[j] === '(') {
				j++;
				while (isSpace(source[j])) j++;

				if (source[j] === '"' || source[j] === "'") {
					const quote = source[j];
					let k = j + 1;
					let value = '';
					while (k < len && source[k] !== quote) {
						if (source[k] === '\\') {
							value += source[k + 1];
							k += 2;
							continue;
						}
						value += source[k];
						k++;
					}
					k++; // consume closing quote
					let m = k;
					while (isSpace(source[m])) m++;

					if (source[m] === ')') {
						// A bare `require("literal")` call — only shape that
						// resolves to a known, static specifier.
						specifiers.push(value);
						i = m + 1;
						continue;
					}
					// Something follows the string before the closing paren
					// (e.g. `require("a" + b)`) — not a static literal call.
					specifiers.push(NON_LITERAL);
					i = k;
					continue;
				}

				// `require(\`template\`)`, `require(identifier)`,
				// `require(expr)` — non-literal, fail closed.
				specifiers.push(NON_LITERAL);
				i = j;
				continue;
			}
		}

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
