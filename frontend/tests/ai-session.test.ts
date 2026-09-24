import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('AI UI requires wallet session and uses authenticated workspace transport',()=>{
 const source=readFileSync(new URL('../app/semantic-review.tsx',import.meta.url),'utf8');
 assert.match(source,/useWorkspace/);
 assert.match(source,/workspaceRequest/);
 assert.doesNotMatch(source,/credentials: 'omit'/);
 assert.match(source,/sessionKey/);
});
