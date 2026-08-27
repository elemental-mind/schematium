import * as assert from "node:assert";
import { array, arrayOf, boolean, number, object, record, recordOf, string, validatorFor, valueOf } from "./schematium.ts";
import type { ValidatorAPI } from "./schematium.ts";

export class ReflectionAPITests
{
    exposesPrimitiveExpectationQueries()
    {
        const validator = validatorFor(number().accepts(value => value < 0));

        assert.strictEqual(validator.expects(number), true);
        assert.strictEqual(validator.expects(string), false);
        assert.strictEqual(validator.expects(boolean), false);
        assert.strictEqual(validator.expectsExclusively(number), true);
    }

    reflectsDeclaredTypes()
    {
        assert.strictEqual(validatorFor(number()).type, number);
        assert.strictEqual(validatorFor(arrayOf(string)).type, array);
        assert.strictEqual(validatorFor(recordOf(string)).type, record);
        assert.strictEqual(validatorFor({ value: string() }).type, object);
        assert.deepStrictEqual(validatorFor(valueOf(number, string)).type, [number, string]);
        assert.deepStrictEqual(validatorFor(valueOf(1, 2)).type, [number]);
    }

    reflectsDeclaredMemberTypes()
    {
        // @ts-expect-error Primitive validators expose basic reflection only.
        assert.strictEqual(validatorFor(number()).memberType, undefined);
        assert.strictEqual(validatorFor(arrayOf(string)).memberType, string);
        assert.deepStrictEqual(validatorFor(recordOf(number, string)).memberType, [number, string]);
        assert.strictEqual(validatorFor({ value: boolean() }).memberType, boolean);
        assert.deepStrictEqual(validatorFor({ name: string(), age: number() }).memberType, [string, number]);
        assert.deepStrictEqual(validatorFor({}).memberType, []);
        // @ts-expect-error Top-level variadic validators expose basic reflection only.
        assert.strictEqual(validatorFor(valueOf(number, string)).memberType, undefined);
    }

    reportsPrimitiveExpectationsForVariadicValidators()
    {
        const validator = validatorFor(valueOf(number, string));

        assert.strictEqual(validator.expects(number), true);
        assert.strictEqual(validator.expects(string), true);
        assert.strictEqual(validator.expects(boolean), false);
        assert.strictEqual(validator.expectsExclusively(number), false);
        assert.strictEqual(validator.expectsExclusively(string), false);
        assert.strictEqual(validator.expectsExclusively(boolean), false);
    }

    treatsSameCategoryLiteralsAsExclusive()
    {
        const validator = validatorFor(valueOf(1, 2));

        assert.strictEqual(validator.expects(number), true);
        assert.strictEqual(validator.expectsExclusively(number), true);
        assert.strictEqual(validator.expects(string), false);
        assert.strictEqual(validator.expectsExclusively(string), false);
    }

    reportsStructuredTypeExpectations()
    {
        const arrayValidator = validatorFor(arrayOf(string));
        const recordValidator = validatorFor(recordOf(number));
        const objectValidator = validatorFor({ value: boolean() });

        assert.strictEqual(arrayValidator.expects(array), true);
        assert.strictEqual(arrayValidator.expectsExclusively(array), true);
        assert.strictEqual(arrayValidator.expects(record), false);
        assert.strictEqual(recordValidator.expects(record), true);
        assert.strictEqual(recordValidator.expectsExclusively(record), true);
        assert.strictEqual(recordValidator.expects(object), false);
        assert.strictEqual(objectValidator.expects(object), true);
        assert.strictEqual(objectValidator.expectsExclusively(object), true);
        assert.strictEqual(objectValidator.expects(record), false);
    }

    reportsStructuredTypeExpectationsForVariadicValidators()
    {
        const validator = validatorFor(valueOf(arrayOf(string), recordOf(number), object({ value: boolean() })));

        assert.strictEqual(validator.expects(array), true);
        assert.strictEqual(validator.expects(record), true);
        assert.strictEqual(validator.expects(object), true);
        assert.strictEqual(validator.expectsExclusively(array), false);
        assert.strictEqual(validator.expectsExclusively(record), false);
        assert.strictEqual(validator.expectsExclusively(object), false);
    }

    reportsCollectionMemberExpectations()
    {
        const arrayValidator = validatorFor(arrayOf(number, string));
        const recordValidator = validatorFor(recordOf(boolean));
        const objectArrayValidator = validatorFor(arrayOf(object({ value: string() })));
        const arrayRecordValidator = validatorFor(recordOf(arrayOf(string)));

        assert.strictEqual(arrayValidator.expectsMember(number), true);
        assert.strictEqual(arrayValidator.expectsMember(string), true);
        assert.strictEqual(arrayValidator.expectsMemberExclusively(number), false);
        assert.strictEqual(recordValidator.expectsMember(boolean), true);
        assert.strictEqual(recordValidator.expectsMemberExclusively(boolean), true);
        assert.strictEqual(recordValidator.expectsMember(string), false);
        assert.strictEqual(objectArrayValidator.expectsMemberExclusively(object), true);
        assert.strictEqual(arrayRecordValidator.expectsMemberExclusively(array), true);
    }

    reportsObjectMemberExpectations()
    {
        const mixedValidator = validatorFor({ name: string(), age: number() });
        const stringValidator = validatorFor({ firstName: string(), lastName: string() });
        const structuredValidator = validatorFor({ tags: arrayOf(string), metadata: recordOf(string) });
        const emptyValidator = validatorFor({});

        assert.strictEqual(mixedValidator.expectsMember(string), true);
        assert.strictEqual(mixedValidator.expectsMember(number), true);
        assert.strictEqual(mixedValidator.expectsMemberExclusively(string), false);
        assert.strictEqual(stringValidator.expectsMemberExclusively(string), true);
        assert.strictEqual(structuredValidator.expectsMember(array), true);
        assert.strictEqual(structuredValidator.expectsMember(record), true);
        assert.strictEqual(structuredValidator.expectsMemberExclusively(array), false);
        assert.strictEqual(emptyValidator.expectsMember(string), false);
        assert.strictEqual(emptyValidator.expectsMemberExclusively(string), false);
    }

}

export class ValidatorAPITests
{
    promotesSingleValueDefinitionsWithoutRecreatingThem()
    {
        const validator = validatorFor(
            number().accepts(value => value > 0)
        );

        assert.strictEqual(validator.check(1), true);
        assert.strictEqual(validator.check(-1), false);
    }

    exposesDeeplyNestedValidatorsThroughEntries()
    {
        const portDefinition = number();
        const configValidator = validatorFor({
            server: {
                endpoint: {
                    host: string(),
                    port: portDefinition,
                },
            },
        });

        const endpointValidator = configValidator.entries.server.entries.endpoint;
        const portValidator = endpointValidator.entries.port;

        assert.strictEqual(portValidator, portDefinition);
        assert.strictEqual(portValidator.check(8080), true);
        assert.strictEqual(portValidator.check("8080"), false);
        assert.strictEqual(endpointValidator.entries.host.check("localhost"), true);

        const parsedPort = portValidator.parseString("8080");
        assert.strictEqual(parsedPort.success, true);
        assert.strictEqual(parsedPort.value, 8080);
    }

    retainsEntriesFromExplicitObjectDefinitions()
    {
        const credentialsDefinition = object({
            username: string(),
            active: boolean(),
        });
        const credentialsValidator = validatorFor({ credentials: credentialsDefinition }).entries.credentials;

        assert.strictEqual(credentialsValidator.entries.username.check("Ada"), true);
        assert.strictEqual(credentialsValidator.entries.active.check(true), true);
    }

    isObjectNarrowsValidatorsWhoseKindIsNotStaticallyKnown()
    {
        const validator: ValidatorAPI<unknown> = validatorFor({ value: number() });
        // @ts-expect-error Reflection is composed onto generated validator types, not ValidatorAPI itself.
        validator.type;

        if (!validator.isObject())
            assert.fail("Expected an object validator");

        assert.strictEqual(validator.entries.value.check(42), true);
        assert.strictEqual(validator.entries.value.check("42"), false);
    }

    collectionsAreNotObjectTemplates()
    {
        const validator = validatorFor({
            values: arrayOf(number),
            labels: recordOf(string),
        });

        assert.strictEqual(validator.entries.values.isObject(), false);
        assert.strictEqual(validator.entries.labels.isObject(), false);
        assert.strictEqual("entries" in validator.entries.values, false);
        assert.strictEqual("entries" in validator.entries.labels, false);
    }
}

export class DefaultValueTests
{
    promotedValueValidatorsExposeTheirDefault()
    {
        const portDefinition = number(8080);
        const portValidator = validatorFor(portDefinition);

        assert.strictEqual(portValidator.getDefault(), 8080);
    }

    objectAndEntryValidatorsExposeNestedDefaults()
    {
        const configValidator = validatorFor({
            server: {
                host: string("localhost"),
                port: number(8080),
            },
            labels: arrayOf(string).withDefault(["stable"]),
        });

        assert.deepStrictEqual(configValidator.getDefault(), {
            server: { host: "localhost", port: 8080 },
            labels: ["stable"],
        });
        assert.deepStrictEqual(configValidator.entries.server.getDefault(), { host: "localhost", port: 8080 });
        assert.strictEqual(configValidator.entries.server.entries.host.getDefault(), "localhost");
        assert.strictEqual(configValidator.entries.server.entries.port.getDefault(), 8080);
        assert.deepStrictEqual(configValidator.entries.labels.getDefault(), ["stable"]);
    }

    nestedCollectionDefaultsAreClonedOnRead()
    {
        const validator = validatorFor({ labels: arrayOf(string).withDefault(["stable"]) }).entries.labels;
        const firstDefault = validator.getDefault();
        const secondDefault = validator.getDefault();

        assert.notStrictEqual(firstDefault, secondDefault);
        assert.deepStrictEqual(firstDefault, ["stable"]);
        assert.deepStrictEqual(secondDefault, ["stable"]);
    }
}
