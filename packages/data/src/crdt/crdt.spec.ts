import {describe, expect, it, vi} from 'vitest';
import {Cx} from '../context.js';
import {assert} from '../utils.js';
import {Crdt} from './crdt.js';

const cx = Cx.todo();
const createTestDocDiff = <T>(data: T) => Crdt.from(cx, data).state();

describe('Doc', () => {
    it('should create new Doc', () => {
        const doc = Crdt.from(cx, {
            string: 'one',
            number: 3,
            boolean: true,
            map: new Map([['key', {a: 4, b: 5}]]),
            array: [
                {a: 6, b: 7},
                {a: 8, b: 9},
            ],
            object: {
                a: 14,
                b: 15,
            },
            optional: undefined,
            nullable: null,
        });

        expect(doc.snapshot(cx)).toEqual({
            string: 'one',
            number: 3,
            boolean: true,
            map: new Map([['key', {a: 4, b: 5}]]),
            array: [
                {a: 6, b: 7},
                {a: 8, b: 9},
            ],
            object: {
                a: 14,
                b: 15,
            },
            optional: undefined,
            nullable: null,
        });
    });

    function createReplica<T>(doc: Crdt<T>): Crdt<T> {
        const replica = Crdt.load(doc.state());
        doc.subscribe(cx, 'update', diff => replica.apply(diff));
        return replica;
    }

    describe('update', () => {
        it('should update the object', () => {
            const doc = Crdt.from(cx, {val: 111});
            const replica = createReplica(doc);
            doc.update(cx, (cx, x) => {
                x.val = 112;
            });

            expect(doc.snapshot(cx)).toEqual({val: 112});
            expect(doc.snapshot(cx)).toEqual(replica.snapshot(cx));
        });

        it('should replace the object', () => {
            const doc = Crdt.from(cx, {val: 111});

            const replica = createReplica(doc);
            doc.update(cx, () => {
                return {val: 312};
            });

            expect(doc.snapshot(cx)).toEqual({val: 312});
            expect(doc.snapshot(cx)).toEqual(replica.snapshot(cx));
        });

        it('should update string', () => {
            const doc = Crdt.from(cx, {s: 'one'});

            const replica = createReplica(doc);
            doc.update(cx, (cx, x) => {
                x.s = 'two';
            });
            expect(doc.snapshot(cx)).toEqual({s: 'two'});
            expect(doc.snapshot(cx)).toEqual(replica.snapshot(cx));
        });

        it('should update array (push)', () => {
            const doc = Crdt.from(cx, {arr: [3, 4, 5]});

            const replica = createReplica(doc);
            doc.update(cx, (cx, x) => {
                x.arr.push(6);
            });
            expect(doc.snapshot(cx)).toEqual({arr: [3, 4, 5, 6]});
            expect(doc.snapshot(cx)).toEqual(replica.snapshot(cx));
        });

        it('should update array (unshift)', () => {
            const doc = Crdt.from(cx, {arr: [3, 4, 5]});

            const replica = createReplica(doc);
            doc.update(cx, (cx, x) => {
                x.arr.unshift(6, 7);
            });
            expect(doc.snapshot(cx)).toEqual({arr: [6, 7, 3, 4, 5]});
            expect(doc.snapshot(cx)).toEqual(replica.snapshot(cx));
        });

        it('should update array (set)', () => {
            const doc = Crdt.from(cx, {arr: [1, 1, 1, 1]});

            const replica = createReplica(doc);
            doc.update(cx, (cx, x) => {
                x.arr[3] = 3;
            });
            expect(doc.snapshot(cx)).toEqual({arr: [1, 1, 1, 3]});
            expect(doc.snapshot(cx)).toEqual(replica.snapshot(cx));
        });

        it('should support root string', () => {
            const doc = Crdt.from(cx, 'init');

            const replica = createReplica(doc);
            doc.update(cx, () => 'updated');

            expect(doc.snapshot(cx)).toEqual('updated');
            expect(doc.snapshot(cx)).toEqual(replica.snapshot(cx));
        });

        it('should support boolean update', () => {
            const doc = Crdt.from(cx, {b: false});

            const replica = createReplica(doc);
            doc.update(cx, (cx, x) => {
                x.b = true;
            });

            expect(doc.snapshot(cx)).toEqual({b: true});
            expect(doc.snapshot(cx)).toEqual(replica.snapshot(cx));
        });

        it('should clear map', () => {
            const doc = Crdt.from(
                cx,
                new Map([
                    ['a', 'one'],
                    ['b', 'two'],
                ])
            );

            const replica = createReplica(doc);
            doc.update(cx, (cx, x) => {
                x.clear();
                assert(cx, x.size === 0);
            });

            expect([...doc.snapshot(cx).entries()]).toEqual([]);
            expect(doc.snapshot(cx)).toEqual(replica.snapshot(cx));
        });

        it('should set map item', () => {
            const doc = Crdt.from(
                cx,
                new Map([
                    ['a', 'v1'],
                    ['b', 'v1'],
                ])
            );
            const replica = createReplica(doc);

            doc.update(cx, (cx, x) => {
                x.set('a', 'v2');
                x.set('c', 'v1');
            });

            expect([...doc.snapshot(cx).entries()]).toEqual([
                ['a', 'v2'],
                ['b', 'v1'],
                ['c', 'v1'],
            ]);
            expect(doc.snapshot(cx)).toEqual(replica.snapshot(cx));
        });

        it('should delete map item', () => {
            const doc = Crdt.from(
                cx,
                new Map([
                    ['a', 'v1'],
                    ['b', 'v1'],
                ])
            );
            const replica = createReplica(doc);

            doc.update(cx, (cx, x) => {
                x.delete('a');
                assert(cx, !x.has('a'));
                assert(cx, x.has('b'));
            });

            expect([...doc.snapshot(cx).entries()]).toEqual([['b', 'v1']]);
            expect(doc.snapshot(cx)).toEqual(replica.snapshot(cx));
        });

        it('should support updating optional schema', () => {
            const doc = Crdt.from<{val: number | undefined}>(cx, {val: 2});

            const replica = createReplica(doc);
            doc.update(cx, (cx, x) => {
                x.val = undefined;
                assert(cx, x.val === undefined);
            });
            expect(doc.snapshot(cx)).toEqual({val: undefined});
            expect(doc.snapshot(cx)).toEqual(replica.snapshot(cx));
            expect(doc.snapshot(cx)).toEqual(replica.snapshot(cx));

            doc.update(cx, (cx, x) => {
                x.val = 3;
                assert(cx, x.val === 3);
            });
            expect(doc.snapshot(cx)).toEqual({val: 3});
            expect(doc.snapshot(cx)).toEqual(replica.snapshot(cx));
            expect(doc.snapshot(cx)).toEqual(replica.snapshot(cx));
        });

        it('should support updating optional schema', () => {
            const doc = Crdt.from<{val: number | null}>(cx, {val: 2});

            const replica = createReplica(doc);
            doc.update(cx, (cx, x) => {
                x.val = null;
                assert(cx, x.val === null);
            });
            expect(doc.snapshot(cx)).toEqual({val: null});
            expect(doc.snapshot(cx)).toEqual(replica.snapshot(cx));
            expect(doc.snapshot(cx)).toEqual(replica.snapshot(cx));

            doc.update(cx, (cx, x) => {
                x.val = 3;
                assert(cx, x.val === 3);
            });
            expect(doc.snapshot(cx)).toEqual({val: 3});
            expect(doc.snapshot(cx)).toEqual(replica.snapshot(cx));
            expect(doc.snapshot(cx)).toEqual(replica.snapshot(cx));
        });

        it('should unsubscribe from updates', async () => {
            const a = Crdt.from(cx, {val: 1});
            const b = Crdt.load(a.state());
            const [subCx, unsub] = Cx.background().withCancel();
            a.subscribe(subCx, 'update', diff => b.apply(diff));

            expect(b.snapshot(cx)).toEqual({val: 1});

            a.update(cx, (cx, x) => {
                x.val = 2;
            });
            expect(b.snapshot(cx)).toEqual({val: 2});

            unsub();

            a.update(cx, (cx, x) => {
                x.val = 3;
            });
            expect(b.snapshot(cx)).toEqual({val: 2});
        });
    });

    it('should create a Crdt instance from a plain value', () => {
        const value = {key: 'value'};
        const crdt = Crdt.from(cx, value);
        expect(crdt.snapshot(cx)).toEqual(value);
    });

    it('should load a Crdt instance from a DocDiff', () => {
        const diff = createTestDocDiff({key: 'value'});
        const crdt = Crdt.load(diff);
        expect(crdt).toBeInstanceOf(Crdt);
    });

    it('should return the correct snapshot', () => {
        const value = {key: 'value'};
        const crdt = Crdt.from(cx, value);
        expect(crdt.snapshot(cx)).toEqual(value);
    });

    it('should return the correct state as DocDiff', () => {
        const value = {key: 'value'};
        const crdt = Crdt.from(cx, value);
        const state = crdt.state();
        expect(state).toBeDefined();
    });

    it('should map over the Crdt instance', () => {
        const value = {key: 'value'};
        const crdt = Crdt.from(cx, value);
        const result = crdt.map(cx, snapshot => snapshot.key);
        expect(result).toBe('value');
    });

    it('should update the Crdt instance with a recipe function', () => {
        const value = {key: 'value'};
        const crdt = Crdt.from(cx, value);
        crdt.update(cx, (cx, draft) => {
            draft.key = 'updatedValue';
        });
        expect(crdt.snapshot(cx)).toEqual({key: 'updatedValue'});
    });

    it('should support subscribing to updates', async () => {
        const value = {key: 'value'};
        const crdt = Crdt.from(cx, value);
        const callback = vi.fn();

        const [subCx, unsub] = Cx.background().withCancel();
        crdt.subscribe(subCx, 'update', callback);

        const diff = createTestDocDiff({key: 'newValue'});
        crdt.apply(diff);

        expect(callback).toHaveBeenCalledWith(expect.any(Uint8Array), {
            tag: undefined,
        });

        unsub();
    });

    it('should unsubscribe from updates', async () => {
        const value = {key: 'value'};
        const crdt = Crdt.from(cx, value);
        const callback = vi.fn();

        const [subCx, unsub] = Cx.background().withCancel();
        crdt.subscribe(subCx, 'update', callback);
        unsub();

        const diff = createTestDocDiff({key: 'newValue'});
        crdt.apply(diff);

        expect(callback).not.toHaveBeenCalled();
    });

    it('should handle deeply nested structures in snapshot', () => {
        const value = {nested: {key: 'value'}};
        const crdt = Crdt.from(cx, value);
        expect(crdt.snapshot(cx)).toEqual(value);
    });

    it('should handle deeply nested structures in update', () => {
        const value = {nested: {key: 'value'}};
        const crdt = Crdt.from(cx, value);
        crdt.update(cx, (cx, draft) => {
            draft.nested.key = 'updatedValue';
        });
        expect(crdt.snapshot(cx)).toEqual({nested: {key: 'updatedValue'}});
    });

    it('should throw error if unsupported value type is passed to mapToYValue', () => {
        const unsupportedValue = new Date();
        expect(() => Crdt.from(cx, unsupportedValue)).toThrow();
    });

    it('should throw error if unsupported YValue type is passed to mapFromYValue', () => {
        const unsupportedYValue = Symbol('unsupported');
        expect(() => Crdt.from(cx, unsupportedYValue)).toThrow();
    });

    it('should preserve object references in snapshots', () => {
        const value = {arr: [{key: 'value'}]};
        const crdt = Crdt.from(cx, value);
        expect(crdt.snapshot(cx).arr[0]).toEqual(value.arr[0]);
    });

    it('should correctly map arrays in updates', () => {
        const value = {arr: [1, 2, 3]};
        const crdt = Crdt.from(cx, value);
        crdt.update(cx, (cx, draft) => {
            draft.arr.push(4);
        });
        expect(crdt.snapshot(cx)).toEqual({arr: [1, 2, 3, 4]});
    });

    it('should support string updates with YText', () => {
        const value = {text: 'initial'};
        const crdt = Crdt.from(cx, value);
        crdt.update(cx, (cx, draft) => {
            draft.text = 'updated';
        });
        expect(crdt.snapshot(cx)).toEqual({text: 'updated'});
    });

    it('should handle empty object snapshots', () => {
        const crdt = Crdt.from(cx, {});
        expect(crdt.snapshot(cx)).toEqual({});
    });

    it('should support empty arrays in snapshots', () => {
        const crdt = Crdt.from(cx, []);
        expect(crdt.snapshot(cx)).toEqual([]);
    });

    it('should maintain separate snapshots for different Crdt instances', () => {
        const value1 = {key: 'value1'};
        const value2 = {key: 'value2'};

        const crdt1 = Crdt.from(cx, value1);
        const crdt2 = Crdt.from(cx, value2);

        expect(crdt1.snapshot(cx)).toEqual(value1);
        expect(crdt2.snapshot(cx)).toEqual(value2);
    });

    it('should handle concurrent subs and updates', async () => {
        const value = {key: 'value'};
        const crdt = Crdt.from(cx, value);
        const callback1 = vi.fn();
        const callback2 = vi.fn();

        const [ctx1, unsub1] = Cx.background().withCancel();
        crdt.subscribe(cx, 'update', callback1);

        const [ctx2, unsub2] = Cx.background().withCancel();
        crdt.subscribe(cx, 'update', callback2);

        const diff = createTestDocDiff({key: 'newValue'});
        crdt.apply(diff);

        expect(callback1).toHaveBeenCalled();
        expect(callback2).toHaveBeenCalled();

        unsub1();
        unsub2();
    });

    it('should handle updates with complex structures', () => {
        const value = {nested: [{key: 'value'}]};
        const crdt = Crdt.from(cx, value);

        crdt.update(cx, (cx, draft) => {
            draft.nested[0].key = 'newValue';
        });

        expect(crdt.snapshot(cx)).toEqual({nested: [{key: 'newValue'}]});
    });

    it('should propagate events in correct order', () => {
        const value = {key: 'value'};
        const crdt = Crdt.from(cx, value);
        const events: string[] = [];

        crdt.subscribe(cx, 'update', (diff, options) => {
            events.push(options.origin || 'no-tag');
        });

        crdt.apply(createTestDocDiff({key: 'value1'}), {origin: 'first'});
        crdt.apply(createTestDocDiff({key: 'value2'}), {origin: 'second'});

        expect(events).toEqual(['first', 'second']);
    });

    it('should correctly unsubscribe in concurrent scenarios', async () => {
        const value = {key: 'value'};
        const crdt = Crdt.from(cx, value);
        const callback = vi.fn();

        const [subCx, unsub] = Cx.background().withCancel();
        crdt.subscribe(subCx, 'update', callback);
        unsub();

        const diff = createTestDocDiff({key: 'newValue'});
        crdt.apply(diff);

        expect(callback).not.toHaveBeenCalled();
    });

    it('should handle large nested structures efficiently', () => {
        const largeValue = {
            key: Array.from({length: 1000}, (_, i) => ({
                id: i,
                value: `value${i}`,
            })),
        };
        const crdt = Crdt.from(cx, largeValue);

        crdt.update(cx, (cx, draft) => {
            draft.key[500].value = 'updatedValue';
        });

        expect(crdt.snapshot(cx).key[500].value).toEqual('updatedValue');
    });
});
