/**
 * Handles formatting and copying the current graph state to the clipboard
 * so it can be pasted directly into official Desmos.
 */

export async function copyToDesmos(graphState, mode = 'console') {
    if (!graphState) return false;

    let exportText = '';

    if (mode === 'console') {
        const stateStr = JSON.stringify(graphState);
        exportText = `Calc.setState(${stateStr});`;
    } else if (mode === 'desmodder') {
        exportText = generateDesmodderText(graphState);
    }

    try {
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(exportText);
            return true;
        } else {
            console.warn("Clipboard API not supported in this context.");
            return false;
        }
    } catch (err) {
        console.error("Failed to copy to clipboard:", err);
        return false;
    }
}

function latexToText(latex) {
    if (!latex) return "";
    let s = latex;

    // Remove \left and \right prefixes
    s = s.replace(/\\left/g, '');
    s = s.replace(/\\right/g, '');

    // Replace basic math operators
    s = s.replace(/\\cdot/g, ' * ');
    s = s.replace(/\\le/g, '<=');
    s = s.replace(/\\ge/g, '>=');
    s = s.replace(/\\to/g, '->');

    // Clean up subscripts: x_{1} -> x_1
    s = s.replace(/_\{([^{}]+)\}/g, '_$1');

    // Replace fractions \frac{a}{b} -> (a)/(b) (handles simple cases)
    // Runs multiple times to catch nested fractions
    while (s.includes('\\frac')) {
        let prev = s;
        // This regex catches \frac{...}{...} as long as there are no nested braces inside the numerator/denominator.
        s = s.replace(/\\frac{([^{}]*)}{([^{}]*)}/g, '($1)/($2)');
        if (s === prev) break; // prevent infinite loop if there's complex nesting
    }

    // Strip backslashes from common functions and symbols
    const mathKeywords = [
        'sin', 'cos', 'tan', 'csc', 'sec', 'cot',
        'arcsin', 'arccos', 'arctan', 'arccsc', 'arcsec', 'arccot',
        'sinh', 'cosh', 'tanh', 'csch', 'sech', 'coth',
        'log', 'ln', 'min', 'max', 'sqrt',
        'pi', 'theta', 'tau', 'phi', 'alpha', 'beta', 'lambda'
    ];

    mathKeywords.forEach(kw => {
        const re = new RegExp(`\\\\${kw}`, 'g');
        s = s.replace(re, kw);
    });

    s = s.replace(/\\/g, ''); // strip remaining backslashes as a fallback

    return s;
}

/**
 * Parses Desmos graph state JSON and converts it to DesModder Text Mode syntax.
 */
function generateDesmodderText(state) {
    let out = [];

    // 1. Settings Block
    const rs = state.randomSeed ? `randomSeed: "${state.randomSeed}",` : '';
    let vp = '';
    if (state.graph && state.graph.viewport) {
        const v = state.graph.viewport;
        vp = `viewport: @{ xmin: ${v.xmin}, xmax: ${v.xmax}, ymin: ${v.ymin}, ymax: ${v.ymax} },`;
    }

    if (rs || vp) {
        out.push(`settings @{\n  ${rs}\n  ${vp}\n}\n`);
    }

    // 2. Expressions
    let currentFolderId = null;

    if (state.expressions && state.expressions.list) {
        state.expressions.list.forEach(exp => {
            // Close folder if item doesn't belong to it
            if (currentFolderId && exp.folderId !== currentFolderId) {
                out.push(`}\n`);
                currentFolderId = null;
            }

            let indent = currentFolderId ? '  ' : '';

            if (exp.type === 'expression' && exp.latex) {
                let attrs = [];
                if (exp.color) attrs.push(`color: "${exp.color}"`);
                if (exp.lines) {
                    const l = exp.lines;
                    const lAttrs = [];
                    if (l.opacity !== undefined) lAttrs.push(`opacity: ${l.opacity}`);
                    if (l.width !== undefined) lAttrs.push(`width: ${l.width}`);
                    if (l.style) lAttrs.push(`style: "${l.style}"`);
                    if (lAttrs.length) attrs.push(`lines: @{ ${lAttrs.join(', ')} }`);
                }
                if (exp.points) {
                    const p = exp.points;
                    const pAttrs = [];
                    if (p.opacity !== undefined) pAttrs.push(`opacity: ${p.opacity}`);
                    if (p.size !== undefined) pAttrs.push(`size: ${p.size}`);
                    if (p.style) pAttrs.push(`style: "${p.style}"`);
                    if (p.drag) pAttrs.push(`drag: "${p.drag}"`);
                    if (pAttrs.length) attrs.push(`points: @{ ${pAttrs.join(', ')} }`);
                }
                if (exp.slider) {
                    const s = exp.slider;
                    const sAttrs = [];
                    if (s.min) sAttrs.push(`min: ${s.min}`);
                    if (s.max) sAttrs.push(`max: ${s.max}`);
                    if (s.step !== undefined) sAttrs.push(`step: ${s.step}`);
                    if (sAttrs.length) attrs.push(`slider: @{ ${sAttrs.join(', ')} }`);
                }

                const cleanedLatex = latexToText(exp.latex);
                if (attrs.length > 0) {
                    out.push(`${indent}${cleanedLatex} @{ ${attrs.join(', ')} }\n`);
                } else {
                    out.push(`${indent}${cleanedLatex}\n`);
                }
            } else if (exp.type === 'text' && exp.text) {
                out.push(`${indent}"${exp.text}"\n`);
            } else if (exp.type === 'folder') {
                currentFolderId = exp.id; // Start folder block
                out.push(`folder "${exp.title || 'Untitled'}" {`);
            } else if (exp.type === 'table') {
                out.push(`${indent}table {`);
                if (exp.columns && exp.columns.length > 0) {
                    exp.columns.forEach(col => {
                        let attrs = [];
                        if (col.color) attrs.push(`color: "${col.color}"`);
                        if (col.hidden !== undefined) attrs.push(`hidden: ${col.hidden}`);
                        if (col.lines) {
                            const l = col.lines;
                            const lAttrs = [];
                            if (l.opacity !== undefined) lAttrs.push(`opacity: ${l.opacity}`);
                            if (l.width !== undefined) lAttrs.push(`width: ${l.width}`);
                            if (l.style) lAttrs.push(`style: "${l.style}"`);
                            if (lAttrs.length) attrs.push(`lines: @{ ${lAttrs.join(', ')} }`);
                        }
                        if (col.points) {
                            const p = col.points;
                            const pAttrs = [];
                            if (p.opacity !== undefined) pAttrs.push(`opacity: ${p.opacity}`);
                            if (p.size !== undefined) pAttrs.push(`size: ${p.size}`);
                            if (p.style) pAttrs.push(`style: "${p.style}"`);
                            if (p.drag) pAttrs.push(`drag: "${p.drag}"`);
                            if (pAttrs.length) attrs.push(`points: @{ ${pAttrs.join(', ')} }`);
                        }

                        let valuesArr = (col.values || []).map(v => v === '' ? 'NaN' : latexToText(v));
                        let valuesStr = '[' + valuesArr.join(', ') + ']';
                        let header = col.latex ? latexToText(col.latex) + ' = ' : '';

                        if (attrs.length > 0) {
                            out.push(`${indent}  ${header}${valuesStr} @{ ${attrs.join(', ')} };`);
                        } else {
                            out.push(`${indent}  ${header}${valuesStr};`);
                        }
                    });
                }
                out.push(`${indent}}\n`);
            }
        });

        // Close dangling folder at the end if exists
        if (currentFolderId) {
            out.push(`}\n`);
        }
    }

    // 3. Ticker
    if (state.expressions && state.expressions.ticker && state.expressions.ticker.handlerLatex) {
        const t = state.expressions.ticker;
        let attrs = [];
        if (t.minStepLatex) attrs.push(`minStep: ${latexToText(t.minStepLatex)}`);
        if (t.playing !== undefined) attrs.push(`playing: ${t.playing}`);

        const handler = latexToText(t.handlerLatex);
        if (attrs.length > 0) {
            out.push(`ticker ${handler} @{ ${attrs.join(', ')} }\n`);
        } else {
            out.push(`ticker ${handler}\n`);
        }
    }

    return out.join('\n');
}
