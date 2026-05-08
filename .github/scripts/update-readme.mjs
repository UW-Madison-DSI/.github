import fs from 'node:fs/promises';

const { GH_TOKEN, ORG } = process.env;
const TOP_N = 6;
const SINCE_DAYS = 30;
const README = 'profile/README.md';
const START = '<!-- ACTIVE_REPOS:START -->';
const END   = '<!-- ACTIVE_REPOS:END -->';

const since = new Date(Date.now() - SINCE_DAYS * 864e5).toISOString();

async function gql(query, variables) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// Pull repos sorted by pushedAt desc, then count recent commits on default branch
const repos = [];
let cursor = null;
while (true) {
  const data = await gql(`
    query($org:String!, $cursor:String) {
      organization(login:$org) {
        repositories(first:50, after:$cursor, isArchived:false,
                     orderBy:{field:PUSHED_AT, direction:DESC},
                     privacy:PUBLIC) {
          pageInfo { hasNextPage endCursor }
          nodes {
            name
            url
            description
            pushedAt
            defaultBranchRef {
              target { ... on Commit {
                history(since:"${since}") { totalCount }
              }}
            }
          }
        }
      }
    }`, { org: ORG, cursor });

  const page = data.organization.repositories;
  repos.push(...page.nodes);
  if (!page.pageInfo.hasNextPage) break;
  cursor = page.pageInfo.endCursor;
  // Early exit: once pushedAt drops below our window, the rest can't qualify
  if (new Date(page.nodes.at(-1).pushedAt) < new Date(since)) break;
}

const top = repos
  .map(r => ({ ...r, commits: r.defaultBranchRef?.target?.history?.totalCount ?? 0 }))
  .filter(r => r.commits > 0)
  .sort((a, b) => b.commits - a.commits)
  .slice(0, TOP_N);

const block = [
  START,
  `### 🔥 Most active repos (last ${SINCE_DAYS} days)`,
  '',
  '| Repo | Commits | Description |',
  '| --- | ---: | --- |',
  ...top.map(r => `| [${r.name}](${r.url}) | ${r.commits} | ${(r.description ?? '').replace(/\|/g, '\\|')} |`),
  '',
  `_Updated ${new Date().toISOString().slice(0, 10)}_`,
  END,
].join('\n');

const current = await fs.readFile(README, 'utf8');
const updated = current.includes(START)
  ? current.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block)
  : current + '\n\n' + block + '\n';

await fs.writeFile(README, updated);
