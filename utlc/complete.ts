import { parser, syntax, token } from "../sexp";
import { parse_expr, type exp } from "./parse_expr";
import * as vscode from "vscode";
import { CompletionItemKind as kind, CompletionItem as Item } from "vscode";
import type { CompletionItemProvider as Provider } from "vscode";

export { make };

// 收集所有 lambda 参数名（递归遍历 AST）
function collect_params(exprs: exp[]): string[] {
    const names: string[] = [];
    const walk = (e: exp) => {
        switch (e.tag) {
            case "abs":
                names.push(e.param);
                walk(e.body);
                break;
            case "app":
                walk(e.func);
                walk(e.args);
                break;
            case "var_":
                break;
        }
    };
    for (const e of exprs) {
        walk(e);
    }
    return names;
}

// 检查 token 是否在光标位置
const is_typing = (tok: token, pos: vscode.Position): boolean => {
    return tok.line === pos.line && tok.character + tok.length === pos.character;
};

// 在语法树中查找光标所在的 token
const typing_token = (sexp: syntax[], pos: vscode.Position): token | undefined => {
    const dfs = (syn: syntax): token | undefined => {
        switch (syn.tag) {
            case syntax.tag.atom:
            case syntax.tag.lone: {
                if (is_typing(syn.leaf, pos)) {
                    return syn.leaf;
                }
                return undefined;
            }
            case syntax.tag.group:
            case syntax.tag.mismatch: {
                return dfs_many(syn.children);
            }
        }
    };
    const dfs_many = (syns: syntax[]): token | undefined => {
        for (const tl of syns) {
            const val = dfs(tl);
            if (val !== undefined) {
                return val;
            }
        }
        return undefined;
    };
    return dfs_many(sexp);
};

// 获取光标位置正在输入的文本
const typing_span = (sexp: syntax[], text: string, pos: vscode.Position): string => {
    const tok = typing_token(sexp, pos);
    return tok ? text.slice(tok.start, tok.end) : "";
};

// 检查光标是否在 group 的开头位置（即紧跟在 `(` 后面）
function isAfterOpenParen(doc: vscode.TextDocument, pos: vscode.Position): boolean {
    if (pos.character === 0) return false;
    const prevChar = doc.lineAt(pos.line).text.slice(0, pos.character).trimEnd();
    return prevChar.endsWith("(");
}

const make = (_out: vscode.OutputChannel): Provider => {
    return {
        provideCompletionItems: (
            doc: vscode.TextDocument,
            pos: vscode.Position,
            _token: vscode.CancellationToken,
            _context: vscode.CompletionContext,
        ) => {
            const text = doc.getText();
            const p = parser.make(text);
            const sexp = parser.parse(p);
            const { exprs } = parse_expr(text);

            // 收集所有 lambda 参数名
            const params = collect_params(exprs);

            // 获取当前正在输入的文本
            const ts = typing_span(sexp, text, pos);

            const rslt: vscode.CompletionItem[] = [];

            // 判断是否在 `(` 后面（可能是 lambda 关键字位置）
            const afterOpen = isAfterOpenParen(doc, pos);

            // 1. 关键字补全：lambda（类似 sample 的 commandCompletion）
            const lambdaKeyword = new Item("lambda", kind.Keyword);
            lambdaKeyword.insertText = new vscode.SnippetString("lambda ${1:x} ${2:body}");
            lambdaKeyword.documentation = new vscode.MarkdownString(
                "Insert a lambda abstraction: `(lambda x body)`"
            );
            lambdaKeyword.command = {
                command: "editor.action.triggerSuggest",
                title: "Re-trigger completions...",
            };
            rslt.push(lambdaKeyword);

            // 2. 关键字补全：λ（同上）
            const lambdaSymbol = new Item("λ", kind.Keyword);
            lambdaSymbol.insertText = new vscode.SnippetString("λ ${1:x} ${2:body}");
            lambdaSymbol.documentation = new vscode.MarkdownString(
                "Insert a lambda abstraction: `(λ x body)`"
            );
            lambdaSymbol.command = {
                command: "editor.action.triggerSuggest",
                title: "Re-trigger completions...",
            };
            rslt.push(lambdaSymbol);

            // 3. 变量补全：所有 lambda 参数名（类似 sample 的 simpleCompletion）
            //    如果在 `(` 后面，降低变量补全的优先级（关键字更相关）
            const seen = new Set<string>();
            for (const name of params) {
                if (!seen.has(name) && name !== ts) {
                    seen.add(name);
                    const item = new Item(name, kind.Variable);
                    // 如果在 `(` 后面，降低排序优先级
                    if (afterOpen) {
                        item.sortText = "z" + name;
                    }
                    rslt.push(item);
                }
            }

            return rslt;
        },
    };
};
