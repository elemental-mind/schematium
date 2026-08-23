import * as assert from "node:assert";
import { arrayOf, boolean, number, object, recordOf, string, validatorFor } from "./schematium.ts";
import type { ValidatorAPI } from "./schematium.ts";

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
