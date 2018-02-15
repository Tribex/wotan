import * as cp from 'child_process';
import * as fs from 'fs';

export interface Dependencies {
    [name: string]: string;
}

export interface PackageData {
    name: string;
    version: string;
    private?: boolean;
    dependencies?: Dependencies;
    devDependencies?: Dependencies;
    peerDependencies?: Dependencies;
}

export function isTreeClean() {
    return cp.spawnSync('git', ['diff-index', '--quiet', 'HEAD', '--']).status === 0 && // unstaged and staged changes
        cp.spawnSync('git', ['ls-files', '--others', '--exclude-standard', '--error-unmatch', '.']).status === 1; // untracked files
}

export function ensureCleanTree() {
    if (!isTreeClean())
        throw new Error('Working directory contains uncommited changes.');
}

export function getCurrentBranch() {
    return cp.spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {encoding: 'utf8'}).stdout.trim();
}

export function ensureBranch(name: string) {
    const branch = getCurrentBranch();
    if (branch !== name)
        throw new Error(`Expected current branch to be ${name}, but it's actually ${branch}.`);
}

export function getLastRelaseTag() {
    return cp.spawnSync('git', ['describe', '--tags', '--match=v*.*.*', '--abbrev=0'], {encoding: 'utf8'}).stdout.trim();
}

export function getPackages() {
    const packages = new Map<string, PackageData>(
        fs.readdirSync('packages').map((name): [string, PackageData] => {
            return [name, require(`../packages/${name}/package.json`)];
        }),
    );
    const publicPackages = new Map<string, PackageData>(Array.from(packages).filter((v) => !v[1].private));
    return {
        packages,
        publicPackages,
    };
}

export function getChangedPackageNames(startRev: string, packageNames: Iterable<string>) {
    const packageDirs = Array.from(packageNames, (p) => 'packages/' + p);
    if (packageDirs.length === 0)
        return new Set<string>();
    const diff = cp.spawnSync(
        'git', ['diff-tree', '-r', '--name-only', '-z', startRev, 'HEAD', ...packageDirs],
        {encoding: 'utf8'},
    ).stdout;
    const result = new Set<string>();
    for (const file of diff.split('\0'))
        if (file)
            result.add(file.split(/[/\\]/)[1]);
    return result;
}

export function writeManifest(path: string, content: PackageData) {
    fs.writeFileSync(path, JSON.stringify(content, undefined, 2) + '\n');
}

export function execAndLog(command: string) {
    console.log(`> ${command}`);
    console.log(cp.execSync(command, {encoding: 'utf8'}));
}
