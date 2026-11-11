import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheGitHub, cachedGitHub, clearGitHubCache, blockGitHub, githubBlocked } from '../src/widgets/github/githubCache.js';
test('cache partitions credentials, clones values and clears on logout',()=>{
  clearGitHubCache();cacheGitHub('alice/repo',{private:true});
  assert.equal(cachedGitHub('bob/repo'),null);
  const value=cachedGitHub('alice/repo');value.private=false;
  assert.equal(cachedGitHub('alice/repo').private,true);
  blockGitHub('alice',Date.now()+60000);assert.equal(githubBlocked('alice'),true);assert.equal(githubBlocked('bob'),false);
  clearGitHubCache();assert.equal(cachedGitHub('alice/repo'),null);assert.equal(githubBlocked('alice'),false);
});
