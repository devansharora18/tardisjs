import {
	BlueprintNode,
	PropNode,
	StateNode,
	ComputedNode,
	MethodNode,
	StyleNode,
	PropType,
} from "../parser/types";

export function compile(ast: BlueprintNode): string {
	const lines: string[] = [];

	lines.push(`// generated from ${ast.name}.tardis — do not edit`);
	lines.push(`// edit the .tardis source file instead`);
	lines.push(`import { $runtime } from 'tardisjs/runtime'`);
	lines.push(``);

	lines.push(compilePropsType(ast.name, ast.props));
	lines.push(``);

	lines.push(`export function ${ast.name}(props: ${ast.name}Props = {}) {`);

	lines.push(compilePropsDefaults(ast.props));
	lines.push(``);

	if (ast.state.length > 0) {
		lines.push(compileState(ast.state));
		lines.push(``);
	}

	if (ast.computed.length > 0) {
		lines.push(compileComputed(ast.computed));
		lines.push(``);
	}

	if (ast.methods.length > 0) {
		lines.push(compileMethods(ast.methods));
		lines.push(``);
	}

	if (ast.events.onMount || ast.events.onDestroy || ast.events.onUpdate) {
		lines.push(compileEvents(ast));
		lines.push(``);
	}

	if (ast.style) {
		lines.push(compileStyle(ast.style));
		lines.push(``);
	}

	const registrations: string[] = [];
	if (ast.state.length > 0) registrations.push("state: _state");
	if (ast.methods.length > 0) registrations.push("methods: _methods");
	lines.push(
		`  $runtime.register('${ast.name}', { ${registrations.join(", ")} })`,
	);
	lines.push(``);

	const scriptCode = ast.script ? compileScript(ast) : undefined;
	lines.push(compileUI(ast.ui.raw, ast.name, scriptCode));
	lines.push(`}`);

	return lines.join("\n");
}

// ── props type ─────────────────────────────────────────────────────────────

function compilePropsType(name: string, props: PropNode[]): string {
	if (props.length === 0) {
		return `type ${name}Props = Record<string, never>`;
	}
	const fields = props.map((p) => {
		const tsType = propTypeToTS(p.type);
		const optional = p.default !== null || p.type === "function" ? "?" : "";
		return `  ${p.name}${optional}: ${tsType}`;
	});
	return `type ${name}Props = {\n${fields.join("\n")}\n}`;
}

function propTypeToTS(type: PropType): string {
	if (Array.isArray(type)) {
		return type.map((v) => `"${v}"`).join(" | ");
	}
	switch (type) {
		case "string":
			return "string";
		case "number":
			return "number";
		case "boolean":
			return "boolean";
		case "array":
			return "unknown[]";
		case "object":
			return "Record<string, unknown>";
		case "function":
			return "(...args: unknown[]) => unknown";
		default:
			return "unknown";
	}
}

// ── props defaults ─────────────────────────────────────────────────────────

function compilePropsDefaults(props: PropNode[]): string {
	if (props.length === 0) {
		return `  const _props = { ...props }`;
	}
	const defaults = props
		.filter((p) => p.default !== null)
		.map((p) => `    ${p.name}: ${formatDefault(p.default, p.type)}`);
	if (defaults.length === 0) {
		return `  const _props = { ...props }`;
	}
	return [
		`  const _props = {`,
		defaults.join(",\n"),
		`    ...props`,
		`  }`,
	].join("\n");
}

function formatDefault(
	val: string | number | boolean | null,
	type: PropType,
): string {
	if (val === null) return "undefined";
	if (typeof val === "number") return String(val);
	if (typeof val === "boolean") return String(val);
	if (val === "[]") return "[]";
	if (val === "{}") return "{}";
	if (typeof val === "string" && val.startsWith("props."))
		return val.replace("props.", "_props.");
	if (typeof val === "string" && val.startsWith("state."))
		return val.replace("state.", "_state.");
	if (Array.isArray(type) || type === "string") return `"${val}"`;
	return String(val);
}

// ── state ──────────────────────────────────────────────────────────────────

function compileState(state: StateNode[]): string {
	const entries = state.map(
		(s) => `    ${s.name}: ${formatDefault(s.default, s.type)}`,
	);
	return [
		`  const _state = $runtime.state({`,
		entries.join(",\n"),
		`  })`,
	].join("\n");
}

// ── computed ───────────────────────────────────────────────────────────────

function compileComputed(computed: ComputedNode[]): string {
	const getters = computed.map((c) => {
		const expr = rewriteRefs(c.expr);
		return `    get ${c.name}() { return ${expr} }`;
	});
	return [`  const _computed = {`, getters.join(",\n"), `  }`].join("\n");
}

// ── methods ────────────────────────────────────────────────────────────────

function compileMethods(methods: MethodNode[]): string {
	const fns = methods.map((m) => {
		const params = m.params.join(", ");
		const body = rewriteRefs(m.body);
		return `    ${m.name}: (${params}) => ${body}`;
	});
	return [`  const _methods = {`, fns.join(",\n"), `  }`].join("\n");
}

// ── events ─────────────────────────────────────────────────────────────────

function compileEvents(ast: BlueprintNode): string {
	const lines: string[] = [];
	lines.push(`  $runtime.events({`);
	if (ast.events.onMount)
		lines.push(`    onMount: () => { ${rewriteRefs(ast.events.onMount)} },`);
	if (ast.events.onDestroy)
		lines.push(
			`    onDestroy: () => { ${rewriteRefs(ast.events.onDestroy)} },`,
		);
	if (ast.events.onUpdate)
		lines.push(`    onUpdate: () => { ${rewriteRefs(ast.events.onUpdate)} },`);
	lines.push(`  })`);
	return lines.join("\n");
}

// ── style ──────────────────────────────────────────────────────────────────

function compileStyle(style: StyleNode): string {
	const rules = style.rules.map((r) => `    "${r.key}": "${r.value}"`);
	return [
		`  const _styles = $runtime.styles("${style.mode}", {`,
		rules.join(",\n"),
		`  }, _props, _state)`,
	].join("\n");
}

// ── ref rewriter ───────────────────────────────────────────────────────────

function rewriteRefs(expr: string): string {
	const rewritten = expr
		.replace(/(?<![_a-zA-Z])state\./g, "_state.")
		.replace(/(?<![_a-zA-Z])props\./g, "_props.")
		.replace(/(?<![_a-zA-Z])computed\./g, "_computed.")
		.replace(/(?<![_a-zA-Z])methods\./g, "_methods.");

	return rewritten
		.replace(/\$update\(\s*_state\.([a-zA-Z_$][\w$]*)\s*,/g, "$runtime.update(_state, '$1',")
		.replace(/\$toggle\(\s*_state\.([a-zA-Z_$][\w$]*)\s*\)/g, "$runtime.toggle(_state, '$1')");
}

// ── ui compiler ────────────────────────────────────────────────────────────

export function compileUI(raw: string, componentName: string, scriptCode?: string): string {
	const lines: string[] = [];
	lines.push(`  // ui`);
	lines.push(`  const _root = (() => {`);
	lines.push(compileUINode(raw.trim(), 2));
	lines.push(`  })()`);
	if (scriptCode) {
		lines.push(``);
		lines.push(scriptCode);
	}
	lines.push(`  return _root`);
	return lines.join("\n");
}

function rewriteElementSelectors(raw: string): string {
	// {<tag id="x" class="y"></tag>} or {<tag id="x" class="y" />} → $el.querySelector('tag#x.y')
	return raw.replace(
		/\{<(\w+)((?:\s+[\w-]+="[^"]*")*)\s*(?:\/>|>\s*<\/\1>)\}/g,
		(_match, tag: string, attrsRaw: string) => {
			let selector = tag;
			const idMatch = attrsRaw.match(/\bid="([^"]*)"/)
			if (idMatch) selector = `${tag}#${idMatch[1]}`;
			const classMatch = attrsRaw.match(/\bclass="([^"]*)"/)
			if (classMatch) {
				selector += classMatch[1].split(/\s+/).map(c => `.${c}`).join('');
			}
			return `$el.querySelector('${selector}')`;
		},
	);
}

function compileScript(ast: BlueprintNode): string {
	const lines: string[] = [];
	lines.push(`  // script`);
	lines.push(`  requestAnimationFrame(() => {`);
	lines.push(`    const $el = _root`);
	lines.push(`    const props = _props`);
	if (ast.state.length > 0) lines.push(`    const state = _state`);
	if (ast.methods.length > 0) lines.push(`    const methods = _methods`);
	if (ast.computed.length > 0) lines.push(`    const computed = _computed`);
	const transformed = rewriteElementSelectors(ast.script!.raw);
	for (const line of transformed.split('\n')) {
		lines.push(`    ${line}`);
	}
	lines.push(`  })`);
	return lines.join('\n');
}

function compileUINode(raw: string, depth: number): string {
	const indent = "  ".repeat(depth);
	const lines: string[] = [];

	// $if
	const ifMatch = raw.match(/^\$if\((.+?)\)\s*\{([\s\S]*)\}/);
	if (ifMatch) {
		const condition = rewriteRefs(ifMatch[1].trim());
		const inner = compileUINode(ifMatch[2].trim(), depth + 1);
		lines.push(`${indent}return $runtime.if(() => ${condition}, () => {`);
		lines.push(inner);
		lines.push(`${indent}})`);
		return lines.join("\n");
	}

	// $each
	const eachMatch = raw.match(
		/^\$each\((.+?),\s*\((\w+)\)\s*=>\s*\{([\s\S]*)\}\s*\)/,
	);
	if (eachMatch) {
		const arrayRef = rewriteRefs(eachMatch[1].trim());
		const itemVar = eachMatch[2];
		const inner = compileUINode(eachMatch[3].trim(), depth + 1);
		lines.push(`${indent}return $runtime.each(() => ${arrayRef}, (${itemVar}) => {`);
		lines.push(inner);
		lines.push(`${indent}})`);
		return lines.join("\n");
	}

	// $show
	const showMatch = raw.match(/^\$show\((.+?)\)\s*\{([\s\S]*)\}/);
	if (showMatch) {
		const condition = rewriteRefs(showMatch[1].trim());
		const inner = compileUINode(showMatch[2].trim(), depth + 1);
		lines.push(`${indent}return $runtime.show(() => ${condition}, () => {`);
		lines.push(inner);
		lines.push(`${indent}})`);
		return lines.join("\n");
	}

	// {} chain syntax
	const chainMatch = raw.match(/^\{([\s\S]+?)\}((?:\s*\.\w+\([^)]*\))+)/);
	if (chainMatch) {
		const innerEl = chainMatch[1].trim();
		const chainStr = chainMatch[2].trim();
		const elCode = compileElement(innerEl, depth);
		const chains = parseChains(chainStr);
		lines.push(`${indent}const _chained = (() => {`);
		lines.push(elCode);
		lines.push(`${indent}})()`);
		for (const chain of chains) {
			lines.push(
				`${indent}$runtime.chain(_chained, '${chain.event}', ${rewriteRefs(chain.handler)})`,
			);
		}
		lines.push(`${indent}return _chained`);
		return lines.join("\n");
	}

  return compileElement(raw, depth)
}

function compileElement(raw: string, depth: number): string {
	const indent = "  ".repeat(depth);
	const lines: string[] = [];
	const trimmed = raw.trim();

	// self-closing tag — find end accounting for braces
	const selfCloseEnd = findSelfCloseEnd(trimmed);
	if (selfCloseEnd >= 0) {
		const tagStr = trimmed.slice(0, selfCloseEnd + 1);
		const tagNameMatch = tagStr.match(/^<([a-zA-Z][a-zA-Z0-9]*)/);
		if (tagNameMatch) {
			const tag = tagNameMatch[1];
			const attrsRaw = tagStr.slice(tag.length + 1, -2).trim(); // between name and />
			if (/^[A-Z]/.test(tag)) {
				lines.push(
					`${indent}return $runtime.component('${tag}', { ${compileComponentProps(attrsRaw)} })`,
				);
				return lines.join("\n");
			}
			lines.push(
				`${indent}const _el_${depth} = document.createElement('${tag}')`,
			);
			for (const attr of parseAttributes(attrsRaw)) {
				lines.push(...compileAttr(attr, depth, indent));
			}
			lines.push(`${indent}return _el_${depth}`);
			return lines.join("\n");
		}
	}

	// opening tag — find end accounting for braces
	const openTagEndIdx = findOpenTagEnd(trimmed);
	if (openTagEndIdx < 0) {
		// plain text or expression
		if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
			lines.push(
				`${indent}return $runtime.text(() => ${rewriteRefs(trimmed.slice(1, -1).trim())})`,
			);
		} else {
			lines.push(`${indent}return $runtime.text(${JSON.stringify(trimmed)})`);
		}
		return lines.join("\n");
	}

	const openTagStr = trimmed.slice(0, openTagEndIdx + 1);
	const tagNameMatch = openTagStr.match(/^<([a-zA-Z][a-zA-Z0-9]*)/);
	if (!tagNameMatch) {
		lines.push(`${indent}return $runtime.text(${JSON.stringify(trimmed)})`);
		return lines.join("\n");
	}

	const tag = tagNameMatch[1];
	const attrsRaw = openTagStr.slice(tag.length + 1, -1).trim();

	if (/^[A-Z]/.test(tag)) {
		lines.push(
			`${indent}return $runtime.component('${tag}', { ${compileComponentProps(attrsRaw)} })`,
		);
		return lines.join("\n");
	}

	const innerContent = findInnerContent(trimmed, tag, openTagEndIdx + 1);

	lines.push(`${indent}const _el_${depth} = document.createElement('${tag}')`);
	for (const attr of parseAttributes(attrsRaw)) {
		lines.push(...compileAttr(attr, depth, indent));
	}

	const children = splitChildren(innerContent);
	let childIndex = 0;
	for (const child of children) {
		const ct = child.trim();
		if (!ct) continue;

    if (ct.startsWith('{') && ct.endsWith('}') && !ct.startsWith('{<')) {
      const expr = rewriteRefs(ct.slice(1, -1).trim())
      lines.push(`${indent}const _text_${depth} = document.createTextNode('')`)
      lines.push(`${indent}$runtime.bind(_text_${depth}, 'textContent', () => String(${expr}))`)
      lines.push(`${indent}_el_${depth}.appendChild(_text_${depth})`)
		} else if (
			ct.startsWith('<') ||
			ct.startsWith('{<') ||
			ct.startsWith('$if(') ||
			ct.startsWith('$each(') ||
			ct.startsWith('$show(')
		) {
			const childVar = `_child_${depth}_${childIndex}`
			lines.push(`${indent}const ${childVar} = (() => {`)
			lines.push(compileUINode(ct, depth + 1))
			lines.push(`${indent}})()`)
			lines.push(`${indent}if (${childVar} instanceof Node) _el_${depth}.appendChild(${childVar})`)
    } else {
			const interpolationRe = /\{([^{}]+)\}/g
			let cursor = 0
			let interpolationIndex = 0
			let hasInterpolation = false
			let match: RegExpExecArray | null

			while ((match = interpolationRe.exec(ct)) !== null) {
				hasInterpolation = true
				const textBefore = ct.slice(cursor, match.index)
				if (textBefore) {
					lines.push(`${indent}_el_${depth}.appendChild(document.createTextNode(${JSON.stringify(textBefore)}))`)
				}

				const textVar = `_text_${depth}_${childIndex}_${interpolationIndex}`
				const expr = rewriteRefs(match[1].trim())
				lines.push(`${indent}const ${textVar} = document.createTextNode('')`)
				lines.push(`${indent}$runtime.bind(${textVar}, 'textContent', () => String(${expr}))`)
				lines.push(`${indent}_el_${depth}.appendChild(${textVar})`)

				cursor = match.index + match[0].length
				interpolationIndex++
			}

			if (hasInterpolation) {
				const tail = ct.slice(cursor)
				if (tail) {
					lines.push(`${indent}_el_${depth}.appendChild(document.createTextNode(${JSON.stringify(tail)}))`)
				}
			} else {
				lines.push(`${indent}_el_${depth}.appendChild(document.createTextNode(${JSON.stringify(ct)}))`)
			}
    }
		childIndex++
  }

	lines.push(`${indent}return _el_${depth}`);
	return lines.join("\n");
}

function compileAttr(
	attr: { name: string; value: string },
	depth: number,
	indent: string,
): string[] {
	const lines: string[] = [];
	if (attr.name.startsWith("@")) {
		const event = attr.name.slice(1);
		const handler = rewriteRefs(
			isReactive(attr.value) ? stripBraces(attr.value) : attr.value,
		);
		lines.push(
			`${indent}_el_${depth}.addEventListener('${event}', ${handler})`,
		);
	} else if (attr.name === "class") {
		if (isReactive(attr.value)) {
			const expr = rewriteRefs(stripBraces(attr.value));
			lines.push(
				`${indent}$runtime.bindClass(_el_${depth}, () => _styles ? $runtime.resolveStyles(_styles, ${expr}) : ${expr})`,
			);
		} else {
			lines.push(
				`${indent}_el_${depth}.className = ${JSON.stringify(attr.value)}`,
			);
		}
	} else if (isReactive(attr.value)) {
		const expr = rewriteRefs(stripBraces(attr.value));
		lines.push(
			`${indent}$runtime.bindAttr(_el_${depth}, '${attr.name}', () => ${expr})`,
		);
	} else {
		lines.push(
			`${indent}_el_${depth}.setAttribute('${attr.name}', ${JSON.stringify(attr.value)})`,
		);
	}
	return lines;
}

// ── attribute parser ───────────────────────────────────────────────────────

function parseAttributes(raw: string): Array<{ name: string; value: string }> {
	const attrs: Array<{ name: string; value: string }> = [];
	let i = 0;

	while (i < raw.length) {
		while (i < raw.length && /\s/.test(raw[i])) i++;
		if (i >= raw.length) break;

		let name = "";
		while (i < raw.length && !/[\s=]/.test(raw[i])) name += raw[i++];
		if (!name) {
			i++;
			continue;
		}

		while (i < raw.length && /\s/.test(raw[i])) i++;
		if (raw[i] !== "=") continue;
		i++;

		while (i < raw.length && /\s/.test(raw[i])) i++;

		if (raw[i] === '"') {
			i++;
			let value = "";
			while (i < raw.length && raw[i] !== '"') value += raw[i++];
			i++;
			attrs.push({ name, value });
		} else if (raw[i] === "{") {
			let depth = 0;
			let expr = "";
			while (i < raw.length) {
				const ch = raw[i];
				if (ch === "{") depth++;
				if (ch === "}") {
					depth--;
					if (depth === 0) {
						expr += ch;
						i++;
						break;
					}
				}
				expr += ch;
				i++;
			}
			attrs.push({ name, value: expr });
		}
	}

	return attrs;
}

// ── chain parser ───────────────────────────────────────────────────────────

function parseChains(raw: string): Array<{ event: string; handler: string }> {
	const chains: Array<{ event: string; handler: string }> = [];
	const re = /\.(\w+)\(([^)]*)\)/g;
	let m;
	const eventMap: Record<string, string> = {
		click: "click",
		hover: "mouseenter",
		blur: "blur",
		focus: "focus",
		keydown: "keydown",
		keyup: "keyup",
		change: "change",
		submit: "submit",
		scroll: "scroll",
		drag: "dragstart",
		mount: "__mount",
		destroy: "__destroy",
	};
	while ((m = re.exec(raw)) !== null) {
		chains.push({ event: eventMap[m[1]] ?? m[1], handler: m[2].trim() });
	}
	return chains;
}

// ── component props compiler ───────────────────────────────────────────────

function compileComponentProps(raw: string): string {
	return parseAttributes(raw)
		.map((a) => {
			if (isReactive(a.value))
				return `${a.name}: () => ${rewriteRefs(stripBraces(a.value))}`;
			return `${a.name}: ${JSON.stringify(a.value)}`;
		})
		.join(", ");
}

// ── helpers ────────────────────────────────────────────────────────────────

function isReactive(value: string): boolean {
	return value.startsWith("{") && value.endsWith("}");
}

function stripBraces(value: string): string {
	return value.slice(1, -1).trim();
}

// find end index of opening tag > accounting for {} inside attribute values
function findOpenTagEnd(raw: string): number {
	const end = findFirstTagEnd(raw);
	if (end < 0) return -1;
	return isSelfClosingTag(raw, end) ? -1 : end;
}

// find end index of self-closing tag /> accounting for {} inside attribute values
function findSelfCloseEnd(raw: string): number {
	const end = findFirstTagEnd(raw);
	if (end < 0) return -1;
	return isSelfClosingTag(raw, end) ? end : -1;
}

function findFirstTagEnd(raw: string): number {
	if (!raw.startsWith("<")) return -1;

	let i = 1;
	let bracesDepth = 0;
	let quote: '"' | "'" | null = null;

	while (i < raw.length) {
		const ch = raw[i];

		if (quote) {
			if (ch === quote) quote = null;
			i++;
			continue;
		}

		if (ch === '"' || ch === "'") {
			quote = ch;
		} else if (ch === "{") {
			bracesDepth++;
		} else if (ch === "}") {
			bracesDepth--;
		} else if (ch === ">" && bracesDepth === 0) {
			return i;
		}

		i++;
	}

	return -1;
}

function isSelfClosingTag(raw: string, end: number): boolean {
	let i = end - 1;
	while (i >= 0 && /\s/.test(raw[i])) i--;
	return raw[i] === "/";
}

function findInnerContent(raw: string, tag: string, startFrom: number): string {
	let depth = 1;
	let i = startFrom;

	while (i < raw.length && depth > 0) {
		if (
			raw.startsWith(`<${tag}`, i) &&
			/[\s>/]/.test(raw[i + tag.length + 1] ?? "")
		) {
			depth++;
			i += tag.length + 2;
		} else if (raw.startsWith(`</${tag}>`, i)) {
			depth--;
			if (depth === 0) break;
			i += tag.length + 3;
		} else {
			i++;
		}
	}

	return raw.slice(startFrom, i).trim();
}

function splitChildren(raw: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = "";
	let i = 0;

	while (i < raw.length) {
		const ch = raw[i];

		if (ch === "<") {
			if (raw[i + 1] === "/") {
				if (depth === 0) {
					if (current.trim()) parts.push(current.trim());
					current = "";
					while (i < raw.length && raw[i] !== ">") i++;
					i++;
					continue;
				}
				depth--;
			} else if (raw[i + 1] !== "!") {
				if (!isSelfClosingFrom(raw, i)) {
					depth++;
				}
			}
		}

		if (ch === "{") depth++;
		if (ch === "}") depth--;

		current += ch;
		i++;

		if (depth === 0 && current.trim()) {
			const next = raw.slice(i).trimStart();
			if (
				next.startsWith("<") ||
				next.startsWith("$") ||
				next.startsWith("{")
			) {
				parts.push(current.trim());
				current = "";
			}
		}
	}

	if (current.trim()) parts.push(current.trim());
	return parts.filter(Boolean);
}

// look-ahead to determine if a tag starting at tagStart is self-closing (ends with />)
function isSelfClosingFrom(raw: string, tagStart: number): boolean {
	let j = tagStart + 1;
	let inQuote: string | null = null;
	let braceDepth = 0;
	while (j < raw.length) {
		const c = raw[j];
		if (inQuote) {
			if (c === inQuote) inQuote = null;
		} else if (c === '"' || c === "'") {
			inQuote = c;
		} else if (c === "{") {
			braceDepth++;
		} else if (c === "}") {
			braceDepth--;
		} else if (c === ">" && braceDepth === 0) {
			let k = j - 1;
			while (k > tagStart && /\s/.test(raw[k])) k--;
			return raw[k] === "/";
		}
		j++;
	}
	return false;
}
