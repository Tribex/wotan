import {
    AbstractRule,
    RuleContext,
    AbstractFormatter,
    FileSummary,
    RuleConstructor,
    FormatterConstructor,
    isTypescriptFile,
} from '@fimbul/ymir';
import * as TSLint from 'tslint';
import * as ts from 'typescript';
import getCaller = require('get-caller-file');
import * as path from 'path';

// tslint:disable-next-line:naming-convention
export function wrapTslintRule(Rule: TSLint.RuleConstructor, name: string = inferName(Rule)): RuleConstructor {
    return class extends AbstractRule {
        public static requiresTypeInformation = // wotan-disable-next-line no-useless-predicate
            !!(Rule.metadata && Rule.metadata.requiresTypeInfo) ||
            Rule.prototype instanceof TSLint.Rules.TypedRule;

        // wotan-disable-next-line no-useless-predicate
        public static deprecated = Rule.metadata && typeof Rule.metadata.deprecationMessage === 'string'
            ? Rule.metadata.deprecationMessage || true // empty deprecation message is coerced to true
            : false;

        // wotan-disable-next-line no-useless-predicate
        public static supports = Rule.metadata && Rule.metadata.typescriptOnly
            ? isTypescriptFile
            : undefined;

        private delegate: TSLint.IRule;

        constructor(context: RuleContext) {
            super(context);
            this.delegate = new Rule({
                ruleArguments: TSLint.Utils.arrayify(context.options),
                ruleSeverity: 'error',
                ruleName: name,
                disabledIntervals: [],
            });
        }

        public apply() {
            if (!this.delegate.isEnabled())
                return;
            let result: TSLint.RuleFailure[];
            if (this.program !== undefined && TSLint.isTypedRule(this.delegate)) {
                result = this.delegate.applyWithProgram(this.sourceFile, this.program);
            } else {
                result = this.delegate.apply(this.sourceFile);
            }
            const {fileName} = this.sourceFile;
            for (const failure of result) {
                if (failure.getFileName() !== fileName)
                    throw new Error(`Adding failures for a different SourceFile is not supported. Expected '${
                        fileName}' but received '${failure.getFileName()}' from rule '${this.delegate.getOptions().ruleName}'.`);
                this.addFailure(
                    failure.getStartPosition().getPosition(),
                    failure.getEndPosition().getPosition(),
                    failure.getFailure(),
                    arrayify(failure.getFix()).map((r) => ({start: r.start, end: r.end, text: r.text})),
                );
            }
        }
    };
}

function inferName(Rule: TSLint.RuleConstructor): string { // tslint:disable-line:naming-convention
    if (Rule.metadata !== undefined && Rule.metadata.ruleName) // wotan-disable-line no-useless-predicate
        return Rule.metadata.ruleName;
    const caller = getCaller(3);
    return path.basename(caller, path.extname(caller));
}

export function wrapTslintFormatter(Formatter: TSLint.FormatterConstructor): FormatterConstructor { // tslint:disable-line:naming-convention
    return class extends AbstractFormatter {
        private failures: TSLint.RuleFailure[] = [];
        private fixed: TSLint.RuleFailure[] = [];
        private delegate: TSLint.IFormatter;

        constructor() {
            super();
            this.delegate = new Formatter();
        }

        public format(fileName: string, summary: FileSummary): undefined {
            let sourceFile: ts.SourceFile | undefined;
            for (let i = 0; i < summary.fixes; ++i)
                this.fixed.push(new TSLint.RuleFailure(getSourceFile(), 0, 0, '', '', TSLint.Replacement.appendText(0, '')));
            if (summary.failures.length === 0)
                return;
            this.failures.push(
                ...summary.failures.map((f) => {
                    const failure = new TSLint.RuleFailure(
                        getSourceFile(),
                        f.start.position,
                        f.end.position,
                        f.message,
                        f.ruleName,
                        f.fix && f.fix.replacements.map((r) => new TSLint.Replacement(r.start, r.end - r.start, r.text)));
                    failure.setRuleSeverity(f.severity);
                    return failure;
                }),
            );
            return;

            function getSourceFile() {
                return sourceFile ||
                    (sourceFile = ts.createSourceFile(fileName, summary.content, ts.ScriptTarget.Latest));
            }
        }

        public flush() {
            return this.delegate.format(this.failures, this.fixed).trim();
        }
    };
}

function arrayify<T>(maybeArr: T | T[] | undefined): T[] {
    return Array.isArray(maybeArr)
        ? maybeArr
        : maybeArr === undefined
            ? []
            : [maybeArr];
}
