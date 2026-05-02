import { describe, expect, it } from "vitest";
import { parse_expr } from "../parse_expr";

describe("utlc parse_expr", () => {
  // === 基本变量 ===
  it("parses variable: x", () => {
    const result = parse_expr("x");
    expect(result.errors).toEqual([]);
    expect(result.exprs[0]).toMatchObject({
      tag: "var_",
      name: "x",
    });
  });

  // === 函数应用 ===
  it("parses application: (f x)", () => {
    const result = parse_expr("(f x)");
    expect(result.errors).toEqual([]);
    expect(result.exprs[0]).toMatchObject({
      tag: "app",
      func: { tag: "var_", name: "f" },
      args: { tag: "var_", name: "x" },
    });
  });

  it("parses multi-argument application: (f x y)", () => {
    const result = parse_expr("(f x y)");
    expect(result.errors).toEqual([]);
    expect(result.exprs[0]).toMatchObject({
      tag: "app",
      func: {
        tag: "app",
        func: { tag: "var_", name: "f" },
        args: { tag: "var_", name: "x" },
      },
      args: { tag: "var_", name: "y" },
    });
  });

  // === Lambda 抽象 ===
  it("parses lambda without parentheses: (lambda x x)", () => {
    const result = parse_expr("(lambda x x)");
    expect(result.errors).toEqual([]);
    expect(result.exprs[0]).toMatchObject({
      tag: "abs",
      param: "x",
      body: { tag: "var_", name: "x" },
    });
  });

  it("parses lambda with parentheses: (lambda (x) x)", () => {
    const result = parse_expr("(lambda (x) x)");
    expect(result.errors).toEqual([]);
    expect(result.exprs[0]).toMatchObject({
      tag: "abs",
      param: "x",
      body: { tag: "var_", name: "x" },
    });
  });

  it("parses nested application inside lambda: (lambda (x) (f x y))", () => {
    const result = parse_expr("(lambda (x) (f x y))");
    expect(result.errors).toEqual([]);
    expect(result.exprs[0]).toMatchObject({
      tag: "abs",
      param: "x",
      body: {
        tag: "app",
        func: {
          tag: "app",
          func: { tag: "var_", name: "f" },
          args: { tag: "var_", name: "x" },
        },
        args: { tag: "var_", name: "y" },
      },
    });
  });

  it("parses lambda with λ symbol: (λ x x)", () => {
    const result = parse_expr("(λ x x)");
    expect(result.errors).toEqual([]);
    expect(result.exprs[0]).toMatchObject({
      tag: "abs",
      param: "x",
      body: { tag: "var_", name: "x" },
    });
  });

  // === 错误场景：空组 ===
  it("reports error for empty group: ()", () => {
    const result = parse_expr("()");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("Empty group");
    expect(result.exprs).toEqual([]);
  });

  // === 错误场景：孤立左括号 ===
  it("reports error for lone opening bracket: (f x", () => {
    const result = parse_expr("(f x");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("Isolated bracket");
  });

  // === 错误场景：lambda 缺少参数 ===
  it("reports error for lambda missing parts: (lambda x)", () => {
    const result = parse_expr("(lambda x)");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("part");
  });

  it("reports error for lambda with empty binder: (lambda () x)", () => {
    const result = parse_expr("(lambda () x)");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("exactly one identifier");
  });

  // === 错误场景：字符串不支持 ===
  it("reports error for string literals: \"hello\"", () => {
    const result = parse_expr('"hello"');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("String");
  });

  it("reports error for single-quoted string: 'world'", () => {
    const result = parse_expr("'world'");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("String");
  });

  // === 错误场景：孤立括号 ===
  it("reports error for lone bracket: )", () => {
    const result = parse_expr(")");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("Isolated bracket");
  });

  // === 复杂嵌套 ===
  it("parses nested lambdas: (lambda (x) (lambda (y) y))", () => {
    const result = parse_expr("(lambda (x) (lambda (y) y))");
    expect(result.errors).toEqual([]);
    expect(result.exprs[0]).toMatchObject({
      tag: "abs",
      param: "x",
      body: {
        tag: "abs",
        param: "y",
        body: { tag: "var_", name: "y" },
      },
    });
  });

  // === 多表达式 ===
  it("parses multiple top-level expressions", () => {
    const result = parse_expr("x (f x) (lambda y y)");
    expect(result.errors).toEqual([]);
    expect(result.exprs).toHaveLength(3);
    expect(result.exprs[0]).toMatchObject({ tag: "var_", name: "x" });
    expect(result.exprs[1]).toMatchObject({ tag: "app" });
    expect(result.exprs[2]).toMatchObject({ tag: "abs", param: "y" });
  });
});
