import { parser, syntax, token } from "../sexp";
import type { position, range } from "../sexp";

// AST 定义（节点包含位置范围）
export type exp = exp.var_ | exp.abs | exp.app;
export namespace exp {
    export type var_ = { tag: "var_"; name: string; range: range };
    export type abs  = { tag: "abs"; param: string; body: exp; range: range };
    export type app  = { tag: "app"; func: exp; args: exp; range: range };
}

// 错误定义与集中消息管理
export type ParseError = {
    range: range;
    message: string;
};

// 错误消息集中定义
const msg = {
    // 括号相关
    emptyGroup: "Empty group is not a valid expression",
    loneBracket: (char: string) => `Isolated bracket '${char}'`,
    mismatch: "Mismatched parentheses",

    // lambda 抽象相关
    lambdaMissingParts: (got: number) =>
        `Lambda abstraction expects a parameter list and a body, but got ${got} part(s)`,
    lambdaInvalidBinder: "Lambda parameter must be an identifier or (identifier)",
    lambdaBinderSingle: "Lambda parameter list must contain exactly one identifier",

    // 函数应用相关
    appMissingParts: (got: number) =>
        `Application expects at least a function and an argument, but got ${got} part(s)`,

    // 不支持的特性
    stringNotSupported: "String literals are not supported",

    // 内部错误（不应暴露给用户，但便于调试）
    unexpectedNode: "Internal error: unexpected syntax node",
};

// 解析上下文
type Context = {
    text: string;                // 原始源代码
    errors: ParseError[];        // 错误收集数组
};

// 辅助函数：从 syntax 节点获取 range
function syntax_to_range(syn: syntax): range {
    switch (syn.tag) {
        case syntax.tag.atom:
        case syntax.tag.lone:
            return token.to_range(syn.leaf);
        case syntax.tag.group:
        case syntax.tag.mismatch: {
            const open = syntax.open(syn);
            const close = syntax.close(syn);
            const start = token.to_start_position(open);
            const end = token.to_end_position(close);
            return { start, end };
        }
        default: {
            const _exhaustive: never = syn;
            throw new Error(msg.unexpectedNode);
        }
    }
}

// 辅助函数：提取文本（atom 或 lone 节点）
function syntax_to_span(syn: syntax, text: string): string {
    if (syn.tag === syntax.tag.atom || syn.tag === syntax.tag.lone) {
        return token.to_span(syn.leaf, text);
    }
    return "";
}

// 从 group 中提取有意义的子节点（过滤空格和圆括号）
function meaningful_children(group: syntax.group): syntax[] {
    return group.children.filter(child => {
        if (child.tag === syntax.tag.atom) {
            const k = child.leaf.kind;
            if (k === token.kind.atom.space) return false;
            if (k === token.kind.parenthesis.left) return false;
            if (k === token.kind.parenthesis.right) return false;
        }
        return true;
    });
}

// 核心解析函数（递归下降）
function parse(ctx: Context, syn: syntax): exp | null {
    const range = syntax_to_range(syn);

    switch (syn.tag) {
        case syntax.tag.atom: {
            const name = syntax_to_span(syn, ctx.text);
            return { tag: "var_", name, range };
        }

        case syntax.tag.lone: {
            const char = syntax_to_span(syn, ctx.text);
            ctx.errors.push({ range, message: msg.loneBracket(char) });
            return null;
        }

        case syntax.tag.mismatch: {
            ctx.errors.push({ range, message: msg.mismatch });
            return null;
        }

        case syntax.tag.group: {
            // 检查是否为字符串字面量（UTLC 不支持）
            const openToken = syntax.open(syn);
            const closeToken = syntax.close(syn);
            if (
                openToken.kind === token.kind.quote.double ||
                openToken.kind === token.kind.quote.single ||
                openToken.kind === token.kind.quote.back
            ) {
                ctx.errors.push({ range, message: msg.stringNotSupported });
                return null;
            }

            const items = meaningful_children(syn);

            // 空组
            if (items.length === 0) {
                ctx.errors.push({ range, message: msg.emptyGroup });
                return null;
            }

            const first = items[0];

            // 检查是否为 lambda 抽象
            if (first.tag === syntax.tag.atom) {
                const keyword = syntax_to_span(first, ctx.text);
                if (keyword === "lambda" || keyword === "λ") {
                    // 期望 items: [lambda, binder, body]
                    if (items.length !== 3) {
                        ctx.errors.push({
                            range,
                            message: msg.lambdaMissingParts(items.length - 1),
                        });
                        return null;
                    }

                    const binderNode = items[1];
                    const bodyNode = items[2];
                    let param: string;

                    if (binderNode.tag === syntax.tag.group) {
                        const binderItems = meaningful_children(binderNode);
                        if (binderItems.length !== 1 || binderItems[0].tag !== syntax.tag.atom) {
                            ctx.errors.push({
                                range: syntax_to_range(binderNode),
                                message: msg.lambdaBinderSingle,
                            });
                            return null;
                        }
                        param = syntax_to_span(binderItems[0], ctx.text);
                    } else if (binderNode.tag === syntax.tag.atom) {
                        param = syntax_to_span(binderNode, ctx.text);
                    } else {
                        ctx.errors.push({
                            range: syntax_to_range(binderNode),
                            message: msg.lambdaInvalidBinder,
                        });
                        return null;
                    }

                    const body = parse(ctx, bodyNode);
                    if (body === null) return null;

                    return { tag: "abs", param, body, range };
                }
            }

            // 否则视为函数应用 (func arg1 arg2 ...)
            if (items.length < 2) {
                ctx.errors.push({
                    range,
                    message: msg.appMissingParts(items.length),
                });
                return null;
            }

            let currentFunc = parse(ctx, items[0]);
            if (currentFunc === null) return null;

            for (let i = 1; i < items.length; i++) {
                const arg = parse(ctx, items[i]);
                if (arg === null) continue; // 跳过解析失败的参数，继续收集后续错误
                const appRange: range = {
                    start: currentFunc.range.start,
                    end: arg.range.end,
                };
                currentFunc = { tag: "app", func: currentFunc, args: arg, range: appRange };
            }
            return currentFunc;
        }

        default: {
            const _exhaustive: never = syn;
            throw new Error(msg.unexpectedNode);
        }
    }
}

// 顶层解析函数：解析整个文件，返回所有顶层表达式和错误列表
export function parse_expr(text: string): { exprs: exp[]; errors: ParseError[] } {
    const ctx: Context = { text, errors: [] };
    const p = parser.make(text);
    const tree = parser.parse(p);

    const exprs: exp[] = [];

    for (const node of tree) {
        // 跳过顶层空格节点
        if (node.tag === syntax.tag.atom && node.leaf.kind === token.kind.atom.space) {
            continue;
        }
        const expr = parse(ctx, node);
        if (expr !== null) {
            exprs.push(expr);
        }
    }

    return { exprs, errors: ctx.errors };
}