# .github

This is the [organization profile repository](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/customizing-your-organizations-profile) for **UW-Madison DSI**. It controls what visitors see on the [org landing page](https://github.com/UW-Madison-DSI).

## Structure

```
.github/
  scripts/update-readme.mjs       # Fetches most-active repos via GitHub GraphQL API
  workflows/update-active-repos.yml  # Runs the script weekly (Mondays at noon UTC)
profile/
  README.md                        # Rendered on the org landing page
```

## Active Repos Workflow

The GitHub Action automatically updates the "most active repos" table in `profile/README.md` each week. It queries the org's public repos, ranks them by commit count over the last 30 days, and inserts the top 6 between the `<!-- ACTIVE_REPOS:START -->` / `<!-- ACTIVE_REPOS:END -->` marker comments.

### Setup

The workflow requires a repository secret:

| Secret | Description |
| --- | --- |
| `ORG_READ_TOKEN` | A GitHub PAT with `read:org` and `repo` scopes |

Once the secret is configured, you can trigger the workflow manually from the **Actions** tab or let it run on its Monday schedule.

## Editing the Org Profile

Edit `profile/README.md` to change what appears on the org landing page. The active repos section between the marker comments will be overwritten by the workflow, so make content changes outside those markers.
