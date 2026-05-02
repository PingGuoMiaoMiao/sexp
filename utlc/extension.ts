import * as vscode from "vscode";
import { registerDiagnostics } from "./diagnostic";
import * as complete from "./complete";

export function activate(context: vscode.ExtensionContext) {
    console.log("UTLC extension activated");

    // 1. 注册诊断功能（实时错误检查）
    registerDiagnostics(context);

    // 2. 注册自动补全提供器
    const out = vscode.window.createOutputChannel("utlc", "log");
    const cmpl = vscode.languages.registerCompletionItemProvider(
        "utlc",
        complete.make(out),
        " ", "(", "λ" // 触发字符：空格、左括号、λ 符号
    );
    context.subscriptions.push(cmpl, out);
}

export function deactivate() {}
