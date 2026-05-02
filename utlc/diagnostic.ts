import * as vscode from "vscode";
import { parse_expr, type ParseError } from "./parse_expr";

const LANGUAGE_ID = "utlc";

/**
 * 将 ParseError 转换为 VS Code Diagnostic
 */
function errorToDiagnostic(err: ParseError): vscode.Diagnostic {
    const { start, end } = err.range;
    const range = new vscode.Range(
        new vscode.Position(start.line, start.character),
        new vscode.Position(end.line, end.character)
    );
    return new vscode.Diagnostic(range, err.message, vscode.DiagnosticSeverity.Error);
}

/**
 * 解析文档并返回诊断结果
 */
function diagnoseDocument(doc: vscode.TextDocument): vscode.Diagnostic[] {
    const text = doc.getText();
    const { errors } = parse_expr(text);
    return errors.map(errorToDiagnostic);
}

/**
 * 注册 UTLC 诊断功能
 * - 监听文档变化（实时诊断）
 * - 监听文档打开
 * - 对已打开的文件执行初始诊断
 */
export function registerDiagnostics(context: vscode.ExtensionContext): void {
    const collection = vscode.languages.createDiagnosticCollection(LANGUAGE_ID);
    context.subscriptions.push(collection);

    // 输出通道，用于调试日志
    const out = vscode.window.createOutputChannel(LANGUAGE_ID, "log");
    context.subscriptions.push(out);

    // 文档变化时更新诊断
    const changeDisposable = vscode.workspace.onDidChangeTextDocument(event => {
        const doc = event.document;
        if (doc.languageId !== LANGUAGE_ID) return;
        if (event.contentChanges.length === 0) return;
        if (doc.uri.scheme === "output") return;

        const diagnostics = diagnoseDocument(doc);
        collection.set(doc.uri, diagnostics);

        if (diagnostics.length > 0) {
            out.appendLine(`[utlc] Found ${diagnostics.length} error(s) in ${doc.uri.fsPath}`);
            for (const diag of diagnostics) {
                out.appendLine(`  - ${diag.message} at ${diag.range.start.line}:${diag.range.start.character}`);
            }
        }
    });
    context.subscriptions.push(changeDisposable);

    // 文档打开时更新诊断
    const openDisposable = vscode.workspace.onDidOpenTextDocument(doc => {
        if (doc.languageId !== LANGUAGE_ID) return;
        const diagnostics = diagnoseDocument(doc);
        collection.set(doc.uri, diagnostics);
    });
    context.subscriptions.push(openDisposable);

    // 对已打开的所有 UTLC 文件执行初始诊断
    for (const doc of vscode.workspace.textDocuments) {
        if (doc.languageId === LANGUAGE_ID) {
            const diagnostics = diagnoseDocument(doc);
            collection.set(doc.uri, diagnostics);
        }
    }
}
