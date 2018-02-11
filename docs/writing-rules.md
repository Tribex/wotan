# Writing Rules

## Important Conventions

* the file name of a rule should be kebab-case to match the name used in the configuration, e.g. `do-something-cool` is implemented in `do-something-cool.ts`.
* the file needs to export a class named `Rule` that extends `AbstractRule` (or any subclass thereof)

## Best Practices

* rules should not have side effects
* rules should not rely on the order of the linted files
* rules should not make assumptions about the execution environment, for example accessing the file system is not guaranteed to work
* the failure message should begin with an uppercase letter (unless it starts with `'`), end with a dot and wrap keywords and code snippets in single quotes.
* fixes should not introduce any syntax or type errors
* fixes should not alter the runtime semantics
* fixes should replace the minimum amount of text necessary to avoid overlapping fixes

## Implementing the Rule

Let's start by implementing a simple rule that bans all uses of type `any` as type declaration.
This rule doesn't need type information and is not configurable, so we extend `AbstractRule`.
If the rule needed type information, you would extend `TypedRule` instead. If the rule was configurable, you should prefer `ConfigurableRule` or `ConfigurableTypedRule`.

We start with the simplest or most common implementation and optimize it while we progress.

```ts
import * as ts from 'typescript';
import { AbstractRule } from '@fimbul/wotan';

export class Rule extends AbstractRule {
    public apply() {
        const cb = (node: ts.Node) => {
            // when we find AnyKeyword, we know this can only occur in type nodes
            if (node.kind === ts.SyntaxKind.AnyKeyword) {
                // we add a failure from the start of the keyword until the end
                // note that we don't provide any fix, since we cannot safely replace 'any' without possibly introducing type errors
                this.addFailureAtNode(node, "Type 'any' is forbidden.");
            }
            // continue visiting child nodes
            ts.forEachChild(node, cb);
        };
        // loop through all child nodes
        ts.forEachChild(this.sourceFile, cb);
    }
}
```

The rule above works, but we can do better. So we grab the low hanging fruit first:
`addFailureAtNode` internally calls `node.getStart(sourceFile)` which is not as cheap as it looks. Computing the start of a node is rather expensive.
Fortunately we know the end of the token and in this case we also know that `any` always has 3 characters.

```ts
                this.addFailure(node.end - 3, node.end, "Type 'any' is forbidden.");
```

Now we avoid computing the start position of the node. But that's only relavant if there is a failure.
Let's try to optimize further: Since type annotations can only occur in `*.ts` and `*.tsx` files, we don't need to execute the rule in any other files.

To disable the rule based on the linted file, you can implement the static `supports` method.

```ts
export class Rule extends AbstractRule {
    public static supports(sourceFile: ts.SourceFile) {
        return /\.tsx?$/.test(sourceFile.fileName); // only apply this rule for *.ts and *.tsx files
    }
```

The optimization above avoid unnecessary work. Unfortunately visiting each AST node by calling `ts.forEachChild` recursively is very expensive. This is where the `RuleContext` saves the day.
The `RuleContext` provides two methods to get a converted version of the AST that is easier to iterate. `RuleContext` also provides some metadata about the current rule, but that's not beneficial for our use at the moment.

Since we are only searching for nodes with a specific kind and are not interested in the location of the node, we choose to iterate over a flattened AST:

```ts
    public apply() {
        for (const node of this.context.getFlatAst()) {
            if (node.kind === ts.SyntaxKind.AnyKeyword) {
                this.addFailure(node.end - 3, node.end, "Type 'any' is forbidden.".)
            }
        }
    }
```

You could convert the AST to the flattened version on your own using `convertAst` from the `tsutils` package. But using `RuleContext#getFlatAst()` caches the result so other rules don't have to convert it again.

The latest optimization reduced the execution time of the rule by about 80% and greatly simplifies the code.
For some rules this is best implementation possible. In this case however, it's only the second-best implementation.

Why iterate an array of thousands of nodes if the whole file doesn't contain a single `any`? So we decide to use a regular expression to scan the source code directly. That only works if you don't expect many false positives.

```ts
    public apply() {
        const re = /\bany\b/g;
        let wrappedAst: WrappedAst | undefined
        for (let match = re.exec(this.sourceFile.text); match !== null; match = re.exec(this.sourceFile.text)) {
            const {node} = getWrappedNodeAtPosition(
                wrappedAst || (wrappedAst = this.context.getWrappedAst()), // only get the wrapped AST if necessary
                match.index,
            )!;
            if (
                node.kind === ts.SyntaxKind.AnyKeyword && // makes sure this is not the content of a string, template or something else
                node.end === match.index + 3 // avoids duplicate failures for 'let foo: /* any */ any;' because the comment is also part of the node
            ) {
                this.addFailure(match.index, node.end, "Type 'any' is forbidden.");
            }
        }
    }
```

This is as fast as it gets. If you are willing to accept the increased complexity, you can adapt this pattern for your own rules.

Finally, here's the complete code of our fully optimized rule:

```ts
import * as ts from 'typescript';
import { AbstractRule } from '@fimbul/wotan';
import { WrappedAst, getWrappedNodeAtPosition } from 'tsutils';

export class Rule extends AbstractRule {
    public static supports(sourceFile: ts.SourceFile) {
        return /\.tsx?$/.test(sourceFile.fileName); // only apply this rule for *.ts and *.tsx files
    }

    public apply() {
        const re = /\bany\b/g;
        let wrappedAst: WrappedAst | undefined
        for (let match = re.exec(this.sourceFile.text); match !== null; match = re.exec(this.sourceFile.text)) {
            const {node} = getWrappedNodeAtPosition(
                wrappedAst || (wrappedAst = this.context.getWrappedAst()), // only get the wrapped AST if necessary
                match.index,
            )!;
            if (
                node.kind === ts.SyntaxKind.AnyKeyword && // makes sure this is not the content of a string, template or something else
                node.end === match.index + 3 // avoids duplicate failures for 'let foo: /* any */ any;' because the comment is also part of the node
            ) {
                this.addFailure(match.index, node.end, "Type 'any' is forbidden.");
            }
        }
    }
}

```