import * as assert from "node:assert";
import { arrayOf, boolean, number, recordOf, schema, string, valueOf, RejectionResult, type ParseSuccessResult } from "../../tests/util/spec-support.ts";

export class ThoroughValidationTests
{
    validateReturnsSuccessResultForValidValue()
    {
        const t = schema({ name: string(), age: number() });
        const result = t.validate({ name: "Alice", age: 30 }, { mode: "thorough" });

        assert.strictEqual(result.success, true);
    }

    validateReturnsRejectionResultForInvalidValue()
    {
        const t = schema({ name: string(), age: number() });
        const result = t.validate({ name: 42, age: "not-a-number" }, { mode: "thorough" });

        assert.strictEqual(result.success, false);
        assert.strictEqual(result instanceof RejectionResult, true, "expected result to be a RejectionResult");
        assert.strictEqual((result as RejectionResult).issues.length, 2, "expected 2 issues for two invalid fields");
    }

    thoroughModeCollectsAllIssuesNotJustFirst()
    {
        const t = schema({
            a: string(),
            b: number(),
            c: boolean(),
        });

        const result = t.validate({ a: 123, b: "wrong", c: "also-wrong" }, { mode: "thorough" });

        assert.strictEqual(result.success, false);
        const issues = (result as RejectionResult).issues;
        // At least 3 type mismatches (a, b, c)
        assert.strictEqual(issues.length, 3, `Expected 3 issues but got ${issues.length}`);
    }

    fastModeStopsAtFirstIssue()
    {
        const t = schema({
            a: string(),
            b: number(),
            c: boolean(),
        });

        const result = t.validate({ a: 123, b: "wrong", c: "also-wrong" }, { mode: "fastNoIssueReport" });

        assert.strictEqual(result.success, false);
        const issues = (result as RejectionResult).issues;
        // Fast mode produces an empty issues array (no issue reporting)
        assert.strictEqual(issues.length, 0);
    }

    thoroughModeReportsMissingRequiredMembers()
    {
        const t = schema({
            required: string(),
            optional: string("default"),
        });

        const result = t.validate({}, { mode: "thorough" });

        assert.strictEqual(result.success, false);
        const issues = (result as RejectionResult).issues;
        assert.strictEqual(issues.some(i => i.kind === "MissingMember"), true, "expected at least one MissingMember issue");
    }

    thoroughModeReportsUnknownMembers()
    {
        const t = schema({ known: string() });

        const result = t.validate({ known: "ok", unknown: "extra" }, { mode: "thorough" });

        assert.strictEqual(result.success, false);
        const issues = (result as RejectionResult).issues;
        assert.strictEqual(issues.some(i => i.kind === "UnknownMember"), true, "expected at least one UnknownMember issue");
    }

    thoroughModeReportsTypeMismatch()
    {
        const t = schema({ value: number() });

        const result = t.validate({ value: "not-a-number" }, { mode: "thorough" });

        assert.strictEqual(result.success, false);
        const issues = (result as RejectionResult).issues;
        assert.strictEqual(issues.some(i => i.kind === "TypeMismatch"), true, "expected at least one TypeMismatch issue");
    }

    thoroughModeReportsUndefinedValue()
    {
        const t = schema({ required: string() });

        const result = t.validate({ required: undefined }, { mode: "thorough" });

        assert.strictEqual(result.success, false);
        const issues = (result as RejectionResult).issues;
        assert.strictEqual(issues.some(i => i.kind === "UndefinedValue"), true, "expected at least one UndefinedValue issue");
    }

    validateDefaultsToFastMode()
    {
        const t = schema({ a: string(), b: number() });

        // Without mode specified, defaults to fastNoIssueReport
        const result = t.validate({ a: 123, b: "wrong" });

        assert.strictEqual(result.success, false);
        const issues = (result as RejectionResult).issues;
        assert.strictEqual(issues.length, 0);
    }
}

export class ValidationIssueTests
{
    issueHasKindDerivedFromClassName()
    {
        const t = schema({ value: number() });
        const result = t.validate({ value: "wrong" }, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.issues.length > 0, true, "expected at least one issue");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
    }
}

export class PathTracingTests
{
    nestedObjectReportsPath()
    {
        const t = schema({
            nested: {
                value: number(),
            },
        });

        const result = t.validate({ nested: { value: "wrong" } }, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        const issue = result.issues.find(i => i.kind === "TypeMismatch");
        assert.notStrictEqual(issue, undefined, "expected a TypeMismatch issue");
        assert.strictEqual(issue!.path, "nested.value");
    }

    deeplyNestedObjectReportsFullPath()
    {
        const t = schema({
            level1: {
                level2: {
                    level3: {
                        value: string(),
                    },
                },
            },
        });

        const result = t.validate({ level1: { level2: { level3: { value: 42 } } } }, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        const issue = result.issues.find(i => i.kind === "TypeMismatch");
        assert.notStrictEqual(issue, undefined, "expected a TypeMismatch issue for deeply nested value");
        assert.strictEqual(issue!.path, "level1.level2.level3.value");
    }

    missingMemberReportsPath()
    {
        const t = schema({
            nested: {
                required: number(),
            },
        });

        const result = t.validate({ nested: {} }, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        const issue = result.issues.find(i => i.kind === "MissingMember");
        assert.notStrictEqual(issue, undefined, "expected a MissingMember issue");
        assert.strictEqual(issue!.path, "nested.required");
    }

    arrayEntryReportsPath()
    {
        const t = schema({
            items: arrayOf(number),
        });

        const result = t.validate({ items: [1, "wrong", 3] }, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        const issue = result.issues.find(i => i.kind === "TypeMismatch");
        assert.notStrictEqual(issue, undefined, "expected a TypeMismatch issue for array entry");
        assert.strictEqual(issue!.path, "items.1");
    }

    recordEntryReportsPath()
    {
        const t = schema({
            data: recordOf(number),
        });

        const result = t.validate({ data: { a: 1, b: "wrong" } }, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        const issue = result.issues.find(i => i.kind === "TypeMismatch");
        assert.notStrictEqual(issue, undefined, "expected a TypeMismatch issue for record entry");
        assert.strictEqual(issue!.path, "data.b");
    }

    multipleIssuesCollectAllPaths()
    {
        const t = schema({
            nested: {
                a: string(),
                b: number(),
            },
        });

        const result = t.validate({ nested: { a: 42, b: "wrong" } }, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.strictEqual(result.issues.length >= 2, true, "expected at least 2 issues for nested type mismatches");
        const paths = result.issues.map(i => i.path).filter(Boolean);
        assert.strictEqual(paths.includes("nested.a"), true, "expected path 'nested.a' in issues");
        assert.strictEqual(paths.includes("nested.b"), true, "expected path 'nested.b' in issues");
    }
}

export class ParseResultIssueTests
{
    parseStringSuccessReturnsParseSuccessResult()
    {
        const t = string();
        const result = t.parseString("hello");

        assert.strictEqual(result.success, true);
        assert.strictEqual("value" in (result as ParseSuccessResult<string>), true, "expected 'value' property in success result");
        assert.strictEqual((result as ParseSuccessResult<string>).value, "hello");
    }

    parseStringFailureReturnsRejectionResult()
    {
        const t = number();
        const result = t.parseString("not-a-number");

        assert.strictEqual(result.success, false);
        assert.strictEqual(result instanceof RejectionResult, true, "expected parse failure to return RejectionResult");
        assert.strictEqual("issues" in result, true, "expected 'issues' property in rejection result");
    }

    parseStringFailureHasIssues()
    {
        const t = number();
        const result = t.parseString("not-a-number", { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.issues.length > 0, true, "expected at least one issue for invalid number parse");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
    }

    parseStringFailureReportsMessage()
    {
        const t = boolean();
        const result = t.parseString("yes", { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.issues.length > 0, true, "expected at least one issue for invalid boolean parse");
        assert.strictEqual(result.issues[0].message!.includes("yes"), true, "expected parse error message to include 'yes'");
    }

    parseStringObjectInvalidJsonReportsParseError()
    {
        const t = schema({ name: string() });
        const result = t.parseString("{invalid json", { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one issue for invalid object member");
    }

    parseStringObjectWithInvalidMemberReportsTypeMismatch()
    {
        const t = schema({ count: number() });
        const result = t.parseString('{"count":"not-a-number"}', { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one issue for invalid object JSON parse");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
        assert.strictEqual(result.issues[0].path, "count");
    }

    parseStringThoroughModeCollectsAllIssues()
    {
        const t = schema({ a: number(), b: boolean() });
        const result = t.parseString('{"a":"wrong","b":"also-wrong"}', { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length >= 2, "expected at least 2 issues for invalid JSON fields");
    }

    parseStringArrayInvalidJsonReportsParseError()
    {
        const t = arrayOf(number);
        const result = t.parseString("[invalid", { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one issue for invalid array JSON");
        assert.strictEqual(result.issues[0].kind, "ParseError");
    }

    parseStringArrayWithInvalidElementReportsTypeMismatch()
    {
        const t = arrayOf(number);
        // JSON parse succeeds but validation of elements fails
        const result = t.parseString('["not-a-number"]', { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one issue for invalid array element");
    }

    parseStringRecordInvalidJsonReportsParseError()
    {
        const t = recordOf(string);
        const result = t.parseString("{bad", { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one issue for invalid record JSON");
        assert.strictEqual(result.issues[0].kind, "ParseError");
    }
}

export class PrimitiveThoroughValidationTests
{
    stringThoroughReportsTypeMismatch()
    {
        const t = string();
        const result = t.validate(42, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one string type mismatch issue");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
    }

    numberThoroughReportsTypeMismatch()
    {
        const t = number();
        const result = t.validate("not-a-number", { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one number type mismatch issue");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
    }

    numberThoroughReportsNonFinite()
    {
        const t = number();
        const result = t.validate(NaN, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one non-finite number issue");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
    }

    numberThoroughReportsInfinity()
    {
        const t = number();
        const result = t.validate(Infinity, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one infinity issue");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
    }

    booleanThoroughReportsTypeMismatch()
    {
        const t = boolean();
        const result = t.validate("not-a-boolean", { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one boolean type mismatch issue");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
    }

    variadicThoroughReportsUnknownValue()
    {
        const t = valueOf(number, string);
        const result = t.validate(true, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one unknown value issue");
        assert.strictEqual(result.issues[0].kind, "UnknownValue");
    }

    requiredPrimitiveReportsUndefinedValue()
    {
        const t = number();
        const result = t.validate(undefined, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one undefined value issue");
        assert.strictEqual(result.issues[0].kind, "UndefinedValue");
    }

    optionalPrimitiveAcceptsUndefined()
    {
        const t = number(42);
        const result = t.validate(undefined, { mode: "thorough" });

        assert.strictEqual(result.success, true);
    }
}

export class CollectionThoroughValidationTests
{
    arrayThoroughReportsAllInvalidEntries()
    {
        const t = arrayOf(number);
        const result = t.validate(["a", "b", 3], { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length >= 2, "expected at least 2 invalid array entry issues");
    }

    recordThoroughReportsAllInvalidEntries()
    {
        const t = recordOf(number);
        const result = t.validate({ a: "wrong", b: "also-wrong", c: 3 }, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length >= 2, "expected at least 2 invalid record entry issues");
    }

    recordThoroughRejectsNonObject()
    {
        const t = recordOf(string);
        const result = t.validate("not-an-object", { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one type mismatch issue for non-object");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
    }

    arrayThoroughRejectsNonArray()
    {
        const t = arrayOf(number);
        const result = t.validate({ not: "array" }, { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.ok(result.issues.length > 0, "expected at least one type mismatch issue for non-array");
        assert.strictEqual(result.issues[0].kind, "TypeMismatch");
    }
}
