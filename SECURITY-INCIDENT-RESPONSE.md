# Security Incident Response Plan

**Project:** FocusBrief AI  
**Status:** Proposed operational runbook for review; not yet formally adopted  
**Owner:** Independent Developer  
**Last reviewed:** November 13, 2026

This document describes the response process for a suspected security or privacy incident involving FocusBrief AI. It is a working procedure, not a guarantee that every response step or notification deadline can be completed within a fixed period.

## 1. Scope

Use this process for suspected or confirmed events involving:

- Unauthorised access to Jira or Confluence information through FocusBrief AI.
- Exposure of credentials, tokens, secrets or application configuration.
- A vulnerability in the app, its dependencies, Forge configuration or deployment.
- Unexpected data disclosure through application logs, diagnostics or support channels.
- A compromise of the developer account, source repository or Atlassian app administration.

Ordinary service interruptions without a security or privacy concern can be handled through normal troubleshooting unless investigation indicates a security impact.

## 2. Reporting a concern

Users should report suspected vulnerabilities or privacy incidents through the security contact channel published in the app's support or Marketplace information.

**Security reporting contact:** deeexchange1@gmail.com (the same address used for developer support).

The developer has confirmed that this inbox is accessible and regularly monitored. Before publishing it in Marketplace information, verify that access is appropriately restricted and test that a security report can be received and acknowledged. If those conditions cannot be met, configure a separate private reporting route before publication.

Use email for initial contact only. Do not send passwords, API tokens, authentication cookies, confidential Jira/Confluence content or unnecessary personal information. Do not assume email is encrypted end-to-end. If investigation requires sensitive evidence, arrange an appropriately restricted transfer method.

Public GitHub issues are not an appropriate channel for vulnerability details, credentials, personal information or confidential Jira/Confluence content. If a report arrives through a public issue, do not repeat sensitive details in a public reply. Restrict or remove exposed material where possible, preserve necessary evidence privately, and direct the reporter to the verified private channel.

## 3. Initial triage

On receiving a report or detecting a possible incident:

1. Record the date and time received, reporter or detection source, affected app/site/environment if known, and a concise description.
2. Acknowledge receipt when a safe reply channel is available. Do not promise a resolution time before the scope is understood.
3. Determine whether the report is credible and whether the issue may affect confidentiality, integrity, availability, credentials, or personal information.
4. Assign an initial severity and document the reason.
5. Preserve relevant evidence before making changes, where doing so does not prolong active exposure.

Do not request passwords, API tokens, authentication cookies, or full Jira/Confluence exports from reporters.

## 4. Severity guide

Use the following as an initial prioritisation guide. Reassess severity as facts become available.

| Level | Example | Initial priority |
|---|---|---|
| Critical | Confirmed unauthorised access to sensitive customer data, active credential compromise, or broad exploitation | Immediate containment and escalation |
| High | A reproducible vulnerability with a credible path to unauthorised data access or privilege abuse | Urgent investigation and mitigation |
| Moderate | Limited exposure or a vulnerability requiring specific conditions, with no confirmed broad compromise | Prioritised remediation |
| Low | Security weakness with limited practical impact, or a report not yet reproducible | Track, validate and schedule |

Severity is based on actual and plausible impact, not solely on the reporter's label.

## 5. Containment

Choose the least disruptive action that safely stops or limits the exposure. Depending on the incident, actions may include:

- Disable or restrict the affected app functionality or installation where the available Atlassian controls permit.
- Pause further deployments while the issue is investigated.
- Revoke or rotate compromised credentials, tokens or secrets using the relevant provider's supported controls.
- Remove exposed secrets from active configuration and repository history where appropriate; assume a published secret is compromised even after removal.
- Restrict repository, developer-console or environment access if an account may be compromised.
- Ask affected site administrators to uninstall or temporarily stop using the app if no safer containment is available.

Do not claim an incident is contained until the relevant access path has been checked.

## 6. Investigation and impact assessment

Maintain a private incident record containing:

- A unique incident reference and timeline.
- Affected app version, environment, installation or site identifiers, where known.
- The suspected vulnerability or failure mechanism.
- Information types potentially involved, such as Jira issue details, profile fields, Confluence search results, diagnostics, credentials or configuration.
- Whether access or disclosure is confirmed, suspected or not established.
- The number and type of potentially affected installations or users, if determinable.
- Evidence sources, actions taken, decisions and remaining uncertainties.

Collect only the evidence needed for investigation. Avoid copying customer content or secrets into public tickets, commits, screenshots or chat messages. Protect incident records and limit access to people who need them.

Do not infer that Atlassian platform logs are available to the developer or that the developer can independently delete Atlassian-held records. Use the relevant Atlassian support and security processes when platform-side investigation is required.

## 7. Notification and escalation

Assess notification obligations promptly with the information available. Depending on the incident, this may include:

- Atlassian through the applicable developer, Marketplace or security support channel.
- Affected site administrators and users.
- Relevant service providers if their systems or credentials are involved.
- Regulators or other authorities where legally required.

Notifications should be accurate, timely and limited to verified facts. Explain what happened, what information may be affected, what actions have been taken, what users should do, and where updates will be provided.

Do not publish incident details or make legal conclusions before assessing the facts and applicable obligations. Where legal or regulatory obligations may apply, obtain qualified advice.

This runbook does not set a fixed notification deadline. Applicable contractual, platform and legal requirements take precedence.

## 8. Remediation and recovery

Before restoring affected functionality:

1. Identify the root cause to a reasonable level of confidence.
2. Implement and review the corrective change.
3. Rotate or revoke exposed credentials where relevant.
4. Run applicable automated tests, dependency/security checks and targeted regression tests.
5. Verify the fix in a non-production environment where feasible.
6. Review permissions and configuration for unnecessary access.
7. Deploy only through the authorised release process.
8. Monitor for recurrence and confirm that containment can safely be lifted.

For FocusBrief AI, preserve the read-only permission model. Do not add scopes or external data flows as an incident workaround without a separate security and privacy review.

## 9. Closure and lessons learned

Close an incident only after documenting:

- Root cause or the best-supported explanation.
- Confirmed and potential impact, including unresolved uncertainties.
- Containment, remediation and recovery actions.
- Notifications made and the basis for those decisions.
- Follow-up work, owners and target dates.
- Whether privacy disclosures, support documentation, tests or security controls need updating.

Review the incident process after a significant event and revise this runbook when lessons or product changes require it.

## 10. Operational readiness checklist

Complete and verify these items before Marketplace launch:

- [x] Confirm that deeexchange1@gmail.com is accessible and regularly monitored by the developer.
- [x] Confirm that Google two-step verification is enabled on the account.
- [x] Verify that access to the inbox is appropriately restricted; the developer confirmed they are the only person with account access.
- [x] Test receipt and acknowledgement of a security report before publishing the contact; a harmless test email was received in the security inbox and acknowledged by reply on November 13, 2026.
- [ ] Publish the security contact only after the reporting route is verified.
- [ ] Arrange a restricted method for transferring sensitive evidence if needed.
  - A private Google Drive folder named `FocusBrief AI - Security Evidence` has been created with General access set to Restricted. It is currently owner-only; no reporter upload or sharing workflow has been configured, so this item remains open.
- [ ] Define a realistic acknowledgement and update target; do not advertise an SLA until it can be met.
- [ ] Confirm access to Atlassian developer and support escalation routes.
- [ ] Identify how to disable or restrict an affected installation or feature.
- [ ] Document where deployment credentials and secrets are managed and how to rotate them.
- [ ] Enable and periodically review appropriate repository protections and dependency/security alerts.
- [ ] Keep incident records in a private, access-controlled location.
- [ ] Review this plan at least when the app's data flows, permissions, hosting or support arrangements materially change.

## 11. Important boundaries

FocusBrief AI uses Atlassian Forge and authenticated Jira/Confluence APIs. This plan does not imply that the developer has direct access to all Atlassian infrastructure logs, can control Atlassian's retention practices, or can independently determine every platform-side impact.

This document is an operational starting point and should be reviewed against the actual production architecture, support arrangements and applicable legal obligations before it is treated as an adopted incident response policy.
