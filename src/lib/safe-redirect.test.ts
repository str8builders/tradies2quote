import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-redirect';
describe('post-sign-in destinations',()=>{
 it.each(['/app/upgrade?plan=crew','/app/upgrade?plan=builder','/app/team?invite=abcdef'])('preserves %s',path=>expect(safeNextPath(path)).toBe(path));
 it.each(['https://example.invalid','//example.invalid','/\\example.invalid','/\n/example.invalid','/\t/example.invalid',null])('rejects external or ambiguous destinations',path=>expect(safeNextPath(path)).toBe('/app'));
});
