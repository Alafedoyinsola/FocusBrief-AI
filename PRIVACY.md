# Privacy Policy

**Proposed effective date:** November 13, 2026

## 1. Introduction

FocusBrief AI is a Jira application developed by an Independent Developer. It helps users review assigned Jira work, identify deadlines and blockers, understand priorities, and generate daily work briefings.

This Privacy Policy explains how FocusBrief AI accesses and processes information when you use the application with Jira Cloud and, optionally, Confluence Cloud.

## 2. Information Accessed and Processed

### Jira information

When you open FocusBrief AI, the application uses your authorised Jira account to retrieve profile information and assigned unresolved work.

This may include:

- Your Jira display name, timezone, and avatar URL.
- Up to 50 Jira issues assigned to you that remain unresolved.
- Issue keys and summaries.
- Statuses, priorities, due dates, and issue types.
- Project identifiers, keys, and names.
- Issue update timestamps.
- Linked issue keys, summaries, statuses, and relationship types, where available.

The application uses this information to calculate workload indicators, identify overdue and approaching deadlines, highlight blockers and dependencies, and generate prioritised recommendations.

### Optional Confluence information

If Confluence is available on your Atlassian site and your account has permission to access it, FocusBrief AI can search for relevant documentation.

For this feature, the application derives search terms from prioritised Jira tasks. These terms may include Jira issue keys, project names, and keywords from task summaries. The application sends one authenticated Confluence search request for a briefing. It can request up to 10 search results and select up to 5 relevant documents to display.

Information returned for selected documents may include:

- Page identifier and title.
- Page URL and a short excerpt.
- Space key and name.
- Last-modified timestamp.

Search terms are sent to Confluence through Atlassian's platform APIs using your authorised account context. They are not sent to an external search provider by the application.

Confluence is optional. The Jira briefing remains available if Confluence is not installed, unavailable, or not authorised.

## 3. How Information Is Used

Information accessed by FocusBrief AI is used to:

- Generate daily work briefings.
- Identify overdue tasks, tasks due today, and approaching deadlines.
- Highlight blocked work and issues that may be blocking other work.
- Calculate explainable task-priority scores.
- Generate a limited number of recommended actions.
- Find and display relevant Confluence documentation when the optional feature is available.
- Show recent activity using Jira issue update timestamps.

Recommendations are generated using deterministic application logic based on available Jira information. They are suggestions only and do not replace your judgement or automatically change your Jira work.

## 4. Jira and Confluence Permissions

FocusBrief AI is designed for read-only access to Jira and Confluence information.

The application does not create, edit, transition, or delete Jira issues. It does not automatically assign tasks, change due dates, or perform other Jira write actions.

Information is accessed through Atlassian's authenticated platform APIs and is subject to the permissions granted to your Atlassian account and the scopes configured for the application.

## 5. Storage and Retention

The application does not use a separate app-managed persistent database to store the Jira or Confluence briefing information described in this policy.

Relevant information is retrieved and processed as needed to generate a briefing. This does not mean that no information is processed or that no operational records exist.

Atlassian may process or retain operational information, application logs, and other platform records under its own policies and terms. The developer does not control Atlassian's retention practices. This policy does not promise a fixed retention period for Atlassian platform records.

## 6. Logging and Diagnostics

The application may record limited operational diagnostic information to help identify API or application problems. Examples include HTTP response status codes and warnings about unexpected or malformed API responses.

The reviewed application error handlers use fixed diagnostic messages rather than deliberately recording raw exception details or Jira issue content in those error messages. This does not mean that Atlassian platform logging or infrastructure diagnostics are disabled.

## 7. Third-Party Services and Sharing

FocusBrief AI operates on the Atlassian Forge platform and uses Atlassian Jira and, where enabled, Confluence services to provide its functionality.

The application does not intentionally send Jira or Confluence briefing information to external AI providers, advertising networks, or independent analytics services.

Atlassian's platform infrastructure and services may process information as necessary to operate the application and provide the underlying Atlassian services. That processing is governed by Atlassian's applicable terms and privacy policies.

## 8. Security

The application uses Atlassian's authenticated platform APIs and permission model to access Jira and Confluence information. Access is subject to the permissions associated with your Atlassian account and the scopes configured for the application.

The developer takes reasonable steps to avoid unnecessary access and exposure of information. No software application or transmission method can be guaranteed to be completely secure.

## 9. Your Choices and Uninstalling the Application

You control the Jira and Confluence permissions associated with your Atlassian account.

You may stop using FocusBrief AI or uninstall it through the applicable Atlassian administration controls. Uninstalling the application stops its future access through that installation, subject to Atlassian's platform processes.

Uninstalling does not necessarily delete operational records or logs retained by Atlassian. Their handling remains subject to Atlassian's policies.

## 10. Changes to This Policy

This Privacy Policy may be updated when the application's functionality, data handling, or applicable requirements change.

The effective date will be updated when a revised version is approved and published.

## 11. Contact

For privacy questions or concerns about FocusBrief AI, contact the developer through the project's GitHub Issues page:

https://github.com/Alafedoyinsola/FocusBrief-AI/issues

Please do not post Jira issue details, personal information, credentials, or other confidential information in public GitHub issues.

**Developer:** Independent Developer
