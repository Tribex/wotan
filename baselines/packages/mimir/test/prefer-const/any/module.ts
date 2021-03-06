import imported from 'foo';
const imported = 0;

export let exported = 0;
let exported2 = 0;
export {
    exported2,
};

try {
    throw 'foo';
} catch (e) {}

var ns = {}, notMerged = '';
             ~~~~~~~~~       [error prefer-const: Variable 'notMerged' is never reassigned. Prefer 'const' instead of 'var'.]
namespace ns {}

const ns2 = {};
namespace ns2 {}

var a;

const foo = 0;
foo;
{
    foo;
    foo === 0;
    const local: typeof foo = 0;
}

bar;
var bar = 0;

useBaz();
var baz = 0;
function useBaz() {
    const local: typeof foo = baz;
}

{
    var bas = 0;
}
bas;

{
    var nested = 0;
}
{
    nested;
}

typeof foobar;
var foobar = 0;

var {[v1]: v2, v1} = {v1: 0};
           ~~                 [error prefer-const: Variable 'v2' is never reassigned. Prefer 'const' instead of 'var'.]
var [v3] = [v3];
var {foo: {} = v4, v4} = {v4: v2}, v5 = 0;
                                   ~~      [error prefer-const: Variable 'v5' is never reassigned. Prefer 'const' instead of 'var'.]

function test(a: string, {length}: any[]) {
    var a = '', d = 0, {p1 = p1, foo: [{p3, p4, p5, ...p6} = p3, ...p2] = [p2, p5] } = {p4} as any;
                ~                                                                                   [error prefer-const: Variable 'd' is never reassigned. Prefer 'const' instead of 'var'.]
                                                       ~~                                           [error prefer-const: Variable 'p6' is never reassigned. Prefer 'const' instead of 'var'.]
    var b = 0, c = 0;
               ~      [error prefer-const: Variable 'c' is never reassigned. Prefer 'const' instead of 'var'.]
    var b: number;
}

for (let len = 10, i = 0; i < len; ++i);
for (const len = 10, i = 0; i < len;);
for (let [key, value] of new Map()) {
               ~~~~~                  [error prefer-const: Variable 'value' is never reassigned. Prefer 'const' instead of 'let'.]
    key = null!;
}
for (const key in {}) {}
for (var arr of arr) {}

let uninitialized: number | undefined;

const alreadyConst = 0;

declare let ambient: string;

declare global {
    let globalVar: number;
}

declare namespace ambientNamespace {
    let var1: string;
    let var2: number;
    export {
        var2,
    };
}
