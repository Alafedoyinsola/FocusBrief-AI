# FocusBrief AI

**Turn your assigned Jira workload into a clear, actionable daily plan.**

FocusBrief AI is an Atlassian Forge Global Page app for Jira that helps you understand your active assigned workload, identify urgent deadlines and blockers, and decide what to focus on next.

Instead of manually reviewing multiple Jira issues, FocusBrief AI combines deterministic task prioritization, dependency analysis, recent activity signals, and optional Confluence documentation discovery in a single daily briefing.

## Features

### Daily Briefing
Get a consolidated overview of your active Jira workload (up to 50 assigned, unresolved issues retrieved per briefing), including:
- Executive summary headline and workload metrics (**Active Tasks**, **Overdue**, **Due Today**, **Blocked**, and **Blocking Others**).
- Urgent alerts for overdue, due-today, approaching (1–3 days), and blocked items.
- Automatic disclosure when Jira's 50-issue retrieval cap applies.
- Manual refresh control with non-destructive error handling.

### Recommended Next Actions
Receive up to 3 ranked recommendations generated deterministically from your Jira issues, factoring in:
- Priority and deadline urgency.
- Overdue status.
- Blocking relationships and unblocking impact.
- Current Jira workflow status.

### Prioritized Active Task Queue
Review, search, and filter active issues using an explainable 0–100 deterministic prioritization score. Inspect full task details in a modal and open issues directly in Jira.

### Blocker and Impact Radar
Inspect directional issue dependencies to separate tasks currently blocked by other work from tasks that are blocking downstream issues.

### What Changed and Confluence Knowledge Discovery
- **Recent Activity Signals:** Summarizes recently updated Jira tasks strictly from Jira `updated` timestamps.
- **Confluence Knowledge Discovery:** When Confluence is installed on the same site and accessible to the current user, FocusBrief AI runs a single read-only CQL search using keywords extracted from active Jira issues and displays up to 5 relevant documents. If Confluence is unavailable, disconnected, or unauthorized, the Jira briefing still loads normally.

### Jira Host Theme Support
The interface synchronizes with Jira's host theme using Forge UI Kit `useTheme()` and Atlassian Design System semantic surface tokens across light and dark appearances.

## How It Works

1. Install FocusBrief AI on your Jira site and grant the requested permissions so it can access Jira data as the signed-in user. Confluence access is optional.
2. Open FocusBrief AI from Jira.
3. Review your daily briefing summary, urgent alerts, and recommended next actions.
4. Filter the prioritized task queue, inspect blocker relationships, or view task details.
5. Open Jira issues or relevant Confluence pages directly from the briefing when ready to act.

FocusBrief AI uses deterministic, rule-based business logic in JavaScript—it does not send Jira or Confluence data to external AI providers. Recommendations are decision-support guidance only; you remain responsible for reviewing and acting on your work.

## Technology

FocusBrief AI is built with:
- Atlassian Forge (`jira:globalPage` native UI Kit module)
- Jira Cloud REST API v3 and Confluence REST API
- React 18 and Atlassian Forge UI Kit (`@forge/react`, `@forge/bridge`)
- JavaScript (`@forge/api`, `@forge/resolver`)
- Node.js 24 runtime (`nodejs24.x`, `arm64`, 256 MB)

## Permissions

FocusBrief AI requests the following Atlassian scopes in `manifest.yml`:

| Scope | Purpose |
|---|---|
| `read:jira-user` | Read the signed-in user's display name, timezone, and avatar URL for the briefing header and date calculations. |
| `read:jira-work` | Read the signed-in user's assigned Jira issues, statuses, priorities, due dates, and issue links. |
| `search:confluence` | Run read-only Confluence searches when Confluence is connected and authorized. |
| `read:confluence-content.summary` | Read titles, links, and content summaries from matching Confluence search results. |

Compatibility in `manifest.yml` requires Jira (`required: true`) and treats Confluence as optional (`required: false`).

## Privacy, Terms, and Security

FocusBrief AI operates with read-only scopes and executes Jira and Confluence API calls as the signed-in user (`api.asUser()`). It does not request write permissions to create, edit, transition, or delete Jira issues, and it does not use a separate app-managed persistent database or external AI/analytics services.

- **Privacy Policy:** [PRIVACY.md](./PRIVACY.md)
- **Terms of Service:** [TERMS.md](./TERMS.md)
- **Support:** [GitHub Issues](https://github.com/Alafedoyinsola/FocusBrief-AI/issues)

## Current Limitations

- **Assigned-issue scope and cap:** Each briefing queries unresolved issues assigned to the current user (`assignee = currentUser() AND resolution IS EMPTY`) up to 50 issues.
- **Confluence dependency:** Knowledge discovery requires Confluence on the same Atlassian site and appropriate user permissions.
- **Source data dependency:** Deadline, priority, and blocker detection depend on the accuracy and completeness of Jira issue fields and links.
- **Decision-support only:** Recommendations and priority scores are guidance, not guaranteed predictions, and FocusBrief AI does not automatically modify Jira issues.

## Development

### Prerequisites

- Node.js 24
- npm
- Atlassian Forge CLI (`@forge/cli`)
- Authenticated Atlassian account and development site with Jira access (and optionally Confluence)

### Install dependencies

```bash
npm install
```

### Run tests

```bash
npm test
```

### Run lint checks

```bash
npm run lint
```

### Deploy to Development (Default)

Deploy to the `development` environment for testing:

```bash
forge deploy --environment development
```

Or using `npx`:

```bash
npx @forge/cli deploy -e development
```

### Install on a Development Site

After deploying, install the app on your Jira development site:

```bash
forge install --environment development --site your-site.atlassian.net
```

Replace `your-site.atlassian.net` with your actual Jira site hostname.

### Deploy to Production

Once verified with `npm test`, `npm run lint`, and Forge checks, deploy explicitly to the `production` environment:

```bash
forge deploy --environment production
```

Or using `npx`:

```bash
npx @forge/cli deploy --environment production
```

Deployment requires Atlassian authentication and app permissions.

## Project

- **Name:** FocusBrief AI
- **Repository:** https://github.com/Alafedoyinsola/FocusBrief-AI

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.
