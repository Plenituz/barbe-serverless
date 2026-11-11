import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const component = readFileSync(new URL('../build/aws_dynamodb.js', import.meta.url), 'utf8');

function syntax(value) {
    if (value?.Type) {
        return value;
    }
    if (Array.isArray(value)) {
        return { Type: 'array_const', ArrayConst: value.map(syntax) };
    }
    if (value !== null && typeof value === 'object') {
        return {
            Type: 'object_const',
            ObjectConst: Object.entries(value).map(([Key, value]) => ({ Key, Value: syntax(value) })),
        };
    }
    return { Type: 'literal_value', Value: value };
}

function value(token) {
    switch (token?.Type) {
        case 'literal_value': return token.Value;
        case 'template': return token.Parts.map(value).join('');
        case 'scope_traversal': return token.Traversal.map(part => part.Name).join('.');
        case 'array_const': return token.ArrayConst.map(value);
        case 'object_const': return Object.fromEntries(token.ObjectConst.map(pair => [pair.Key, value(pair.Value)]));
        default: return structuredClone(token);
    }
}

function generate(config) {
    const input = {
        aws_dynamodb: {
            messages: [{ Type: 'aws_dynamodb', Name: 'messages', Value: syntax(config) }],
        },
    };
    const requests = [];
    runInNewContext(component, {
        os: {
            file: { readFile: () => JSON.stringify(input) },
            getenv: () => 'generate',
        },
        readline: () => JSON.stringify({ result: {} }),
        console: { log: message => requests.push(JSON.parse(message)) },
    });
    return requests.flatMap(request => request.params[0].databags)
        .map(bag => ({ ...bag, Value: value(bag.Value) }));
}

function table(resources) {
    return resources.find(resource => resource.Name === 'messages_aws_dynamodb').Value;
}

const multiIndex = {
    hash_keys: [{ name: 'EventId' }, { name: 'HumanId' }],
    range_keys: [{ name: 'LastUpdateMs', type: 'N' }, { name: 'UniqueMessageId' }],
};

test('plural keys emit an ordered schema and deduplicate typed attributes', () => {
    const result = table(generate({
        hash_key: 'UniqueMessageId',
        billing_mode: 'PAY_PER_REQUEST',
        global_secondary_index: [multiIndex],
    }));
    const index = result.global_secondary_index[0];
    assert.equal(index.name, 'EventId_HumanId-LastUpdateMs_UniqueMessageId-index');
    assert.deepEqual(index.key_schema, [
        { attribute_name: 'EventId', key_type: 'HASH' },
        { attribute_name: 'HumanId', key_type: 'HASH' },
        { attribute_name: 'LastUpdateMs', key_type: 'RANGE' },
        { attribute_name: 'UniqueMessageId', key_type: 'RANGE' },
    ]);
    assert.equal(index.hash_key, undefined);
    assert.equal(index.range_key, undefined);
    assert.equal(index.read_capacity, undefined);
    assert.deepEqual(result.attribute, [
        { name: 'UniqueMessageId', type: 'S' },
        { name: 'EventId', type: 'S' },
        { name: 'HumanId', type: 'S' },
        { name: 'LastUpdateMs', type: 'N' },
    ]);
});

test('singular configs retain names and scalar Terraform keys', () => {
    const result = table(generate({
        hash_key: 'UniqueMessageId',
        global_secondary_index: [
            { hash_key: 'EventId' },
            { hash_key: 'HumanId', range_key: 'LastUpdateMs', range_key_type: 'N' },
        ],
    }));
    assert.deepEqual(result.global_secondary_index, [
        { name: 'EventId-index', hash_key: 'EventId', range_key: undefined, read_capacity: 1, write_capacity: 1, projection_type: 'ALL' },
        { name: 'HumanId-LastUpdateMs-index', hash_key: 'HumanId', range_key: 'LastUpdateMs', read_capacity: 1, write_capacity: 1, projection_type: 'ALL' },
    ]);
});

test('reused attributes inherit their established type when an index omits it', () => {
    for (const type of ['N', 'B']) {
        const result = table(generate({
            hash_key: 'id',
            hash_key_type: type,
            range_key: 'sort',
            range_key_type: type,
            global_secondary_index: [
                { hash_key: 'category', range_key: 'id' },
                { hash_key: 'sort', range_key: 'time', range_key_type: type },
                { hash_key: 'category', range_key: 'time' },
                { hash_keys: [{ name: 'id' }, { name: 'time' }], range_keys: [{ name: 'sort' }] },
            ],
        }));
        assert.deepEqual(result.attribute, [
            { name: 'id', type },
            { name: 'sort', type },
            { name: 'category', type: 'S' },
            { name: 'time', type },
        ]);
    }
});

test('shared attribute types preserve unresolved Terraform expressions', () => {
    const functionType = {
        Type: 'function_call',
        FunctionName: 'upper',
        FunctionArgs: [syntax('n')],
    };
    const variableType = {
        Type: 'scope_traversal',
        Traversal: [{ Type: 'attr', Name: 'var' }, { Type: 'attr', Name: 'key_type' }],
    };
    for (const [firstType, secondType] of [
        [functionType, functionType],
        [functionType, 'N'],
        [variableType, 'N'],
        ['N', functionType],
        ['N', variableType],
        [functionType, undefined],
    ]) {
        for (const index of [
            { hash_key: 'category', range_key: 'id', ...(secondType ? { range_key_type: secondType } : {}) },
            { hash_keys: [{ name: 'id', ...(secondType ? { type: secondType } : {}) }] },
        ]) {
            const result = table(generate({
                hash_key: 'id',
                hash_key_type: firstType,
                global_secondary_index: [index],
            }));
            assert.deepEqual(result.attribute.find(attribute => attribute.name === 'id').type, value(syntax(firstType)));
        }
    }
});

test('explicit names are used by the index and its autoscaling targets', () => {
    for (const keys of [multiIndex, { hash_key: 'EventId' }]) {
        const resources = generate({
            hash_key: 'UniqueMessageId',
            auto_scaling: [{ min: 1, max: 5 }],
            global_secondary_index: [{ ...keys, name: 'attendee-history' }],
        });
        assert.equal(table(resources).global_secondary_index[0].name, 'attendee-history');
        const targets = resources.filter(resource => resource.Value?.scalable_dimension?.startsWith('dynamodb:index:'));
        assert.equal(targets.length, 2);
        for (const target of targets) {
            assert.ok(target.Value.resource_id.endsWith('/index/attendee-history'));
        }
    }
});

test('singular and plural keys can be combined on different sides', () => {
    for (const index of [
        { hash_key: 'EventId', range_keys: multiIndex.range_keys },
        { hash_keys: multiIndex.hash_keys, range_key: 'LastUpdateMs', range_key_type: 'N' },
        { hash_keys: multiIndex.hash_keys, range_keys: [] },
    ]) {
        const result = table(generate({ hash_key: 'UniqueMessageId', global_secondary_index: [index] }));
        assert.ok(result.global_secondary_index[0].key_schema);
        assert.equal(result.global_secondary_index[0].hash_key, undefined);
        assert.equal(result.global_secondary_index[0].range_key, undefined);
    }
});

test('invalid key definitions fail before exporting Terraform', () => {
    const invalid = [
        [{ ...multiIndex, hash_key: 'EventId' }, /cannot be combined/],
        [{ ...multiIndex, range_key_type: 'N' }, /cannot be combined/],
        [{ hash_keys: [] }, /1 to 4/],
        [{ hash_keys: Array.from({ length: 5 }, (_, i) => ({ name: `key${i}` })) }, /1 to 4/],
        [{ hash_key: 'EventId', range_keys: Array.from({ length: 5 }, (_, i) => ({ name: `key${i}` })) }, /0 to 4/],
        [{ hash_keys: [{ name: 'EventId' }, { name: 'EventId' }] }, /must be unique/],
        [{ hash_key: 'EventId', range_keys: [{ name: 'EventId' }] }, /must be unique/],
        [{ hash_keys: [{}] }, /requires a name/],
        [{ hash_keys: 'EventId' }, /must be a list/],
    ];
    for (const [index, error] of invalid) {
        assert.throws(() => generate({ hash_key: 'UniqueMessageId', global_secondary_index: [index] }), error);
    }
    assert.throws(() => generate({ hash_key: 'id', hash_keys: [{ name: 'id' }] }), /only supported on global secondary indexes/);
    assert.throws(() => generate({
        hash_key: 'id',
        global_secondary_index: [{ hash_keys: [{ name: 'id', type: 'N' }] }],
    }), /conflicting types/);
    assert.throws(() => generate({
        hash_key: 'id',
        global_secondary_index: [{ hash_key: 'EventId' }, { hash_keys: [{ name: 'EventId', type: 'N' }] }],
    }), /conflicting types/);
    assert.throws(() => generate({
        hash_key: 'id',
        hash_key_type: 'N',
        global_secondary_index: [{ hash_key: 'category', range_key: 'id', range_key_type: 'S' }],
    }), /conflicting types/);
});
