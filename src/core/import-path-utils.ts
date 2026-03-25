export function isRepoOwnedImportPath(target: string): boolean {
  return /^(?:\.{1,2}\/|@\/|~\/)/u.test(target);
}
