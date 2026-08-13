import * as assert from "node:assert";
import { oneOf, RejectionResult, assertParseSuccess } from "../../../tests/util/spec-support.ts";

export class OneOfDefinitionTests
{
    acceptsMatchingStringLiterals()
    {
        const t = oneOf("open", "closed", "pending");

        assert.strictEqual(t.check("open"), true);
        assert.strictEqual(t.check("closed"), true);
        assert.strictEqual(t.check("pending"), true);
    }

    rejectsNonMatchingStringLiteral()
    {
        const t = oneOf("open", "closed");

        assert.strictEqual(t.check("invalid"), false);
        assert.strictEqual(t.check(""), false);
    }

    acceptsMatchingNumberLiterals()
    {
        const t = oneOf(1, 2, 3);

        assert.strictEqual(t.check(1), true);
        assert.strictEqual(t.check(2), true);
        assert.strictEqual(t.check(3), true);
    }

    rejectsNonMatchingNumberLiteral()
    {
        const t = oneOf(1, 2, 3);

        assert.strictEqual(t.check(4), false);
        assert.strictEqual(t.check(0), false);
    }

    rejectsWrongType()
    {
        const t = oneOf("a", "b");

        assert.strictEqual(t.check(42), false);
        assert.strictEqual(t.check(true), false);
        assert.strictEqual(t.check(null), false);
        assert.strictEqual(t.check(undefined), false);
    }

    parsesMatchingStringLiteral()
    {
        const t = oneOf("yes", "no");

        assertParseSuccess(t.parseString("yes"), "yes");
        assertParseSuccess(t.parseString("no"), "no");
    }

    parsesMatchingNumberLiteral()
    {
        const t = oneOf(10, 20, 30);

        assertParseSuccess(t.parseString("10"), 10);
        assertParseSuccess(t.parseString("20"), 20);
    }

    rejectsParseOfNonMatchingValue()
    {
        const t = oneOf("yes", "no");

        assert.strictEqual(t.parseString("maybe").success, false);
    }

    rejectsParseOfNonMatchingNumber()
    {
        const t = oneOf(1, 2, 3);

        assert.strictEqual(t.parseString("4").success, false);
    }

    rejectsParseOfInvalidNumberString()
    {
        const t = oneOf(1, 2, 3);

        assert.strictEqual(t.parseString("abc").success, false);
    }

    thoroughModeReportsLiteralMismatch()
    {
        const t = oneOf("a", "b");

        const result = t.validate("c", { mode: "thorough" }) as RejectionResult;

        assert.strictEqual(result.success, false);
        assert.strictEqual(result.issues.length > 0, true, "expected at least one issue for literal mismatch");
        assert.strictEqual(result.issues[0].kind, "UnknownValue");
    }

    mixedStringAndNumberLiterals()
    {
        // oneOf only accepts string | number, so mixing is allowed
        const t = oneOf("yes", 1);

        assert.strictEqual(t.check("yes"), true);
        assert.strictEqual(t.check(1), true);
        assert.strictEqual(t.check("1"), false);
        assert.strictEqual(t.check("no"), false);
    }
}
