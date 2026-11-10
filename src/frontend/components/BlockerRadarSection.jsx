import React from 'react';
import {
  Badge,
  Box,
  Button,
  Code,
  EmptyState,
  Heading,
  Icon,
  Inline,
  Lozenge,
  Stack,
  Text,
  xcss
} from '@forge/react';
import {
  findIssueByKey,
  getDeadlineAppearance,
  getScorePresentation
} from '../briefingViewHelpers.js';

/**
 * BlockerRadarSection highlights dependency risks and leverage points in two groups:
 * 1. Tasks currently blocked by unresolved upstream dependencies or blocked workflow status.
 * 2. Active tasks holding up other unresolved Jira work (high-leverage unblocking opportunities).
 */
export function BlockerRadarSection({ issues, palette, onSelectIssue, onOpenIssue }) {
  const safeIssues = Array.isArray(issues) ? issues : [];
  const blockedIssues = safeIssues.filter((issue) => Boolean(issue.blocker?.isBlocked));
  const blockingOthersIssues = safeIssues.filter(
    (issue) =>
      Array.isArray(issue.blocker?.blocksOthersKeys) &&
      issue.blocker.blocksOthersKeys.length > 0
  );

  const cardStyle = xcss({
    borderColor: palette.borderColor,
    borderStyle: 'solid',
    borderWidth: 'border.width',
    borderRadius: 'radius.medium',
    boxShadow: 'elevation.shadow.raised'
  });

  const hostSurfaceStyle = xcss({
    borderColor: 'color.border',
    borderStyle: 'solid',
    borderWidth: 'border.width',
    borderRadius: 'radius.medium'
  });

  if (blockedIssues.length === 0 && blockingOthersIssues.length === 0) {
    return (
      <Box backgroundColor={palette.hostSurfaceBg} padding="space.200" xcss={hostSurfaceStyle}>
        <EmptyState
          header="Blocker radar is clear"
          description="None of your active Jira tasks are blocked by unresolved dependencies or holding up downstream issues."
        />
      </Box>
    );
  }

  return (
    <Stack space="space.250">
      <Box backgroundColor={palette.cardBg} padding="space.200" xcss={cardStyle}>
        <Stack space="space.150">
          <Inline spread="space-between" alignBlock="center" shouldWrap>
            <Inline space="space.100" alignBlock="center">
              <Icon glyph="lock-locked" label="Blocked tasks" size="small" color={palette.iconColor} />
              <Heading as="h2" size="medium" color={palette.headingColor}>
                Blocked Tasks ({blockedIssues.length})
              </Heading>
            </Inline>
            <Text size="small" color={palette.subduedTextColor}>
              Tasks waiting on unresolved dependencies or flagged with a Blocked status
            </Text>
          </Inline>

          {blockedIssues.length === 0 ? (
            <Text size="small" color={palette.textColor}>
              No tasks are currently blocked.
            </Text>
          ) : (
            <Stack space="space.150">
              {blockedIssues.map((issue) => {
                const blockedByList = Array.isArray(issue.blocker?.blockedBy)
                  ? issue.blocker.blockedBy
                  : [];
                const scoreMeta = getScorePresentation(issue.score);

                return (
                  <Box
                    key={`blocked-${issue.key}`}
                    backgroundColor={palette.subtleCardBg}
                    padding="space.200"
                    xcss={cardStyle}
                  >
                    <Stack space="space.150">
                      <Inline spread="space-between" alignBlock="center" shouldWrap rowSpace="space.100">
                        <Inline space="space.075" alignBlock="center" shouldWrap>
                          <Code>{issue.key}</Code>
                          <Heading as="h3" size="small" color={palette.headingColor}>
                            {issue.summary}
                          </Heading>
                        </Inline>
                        <Inline space="space.075" alignBlock="center">
                          <Lozenge appearance="danger">{issue.status?.name || 'Blocked'}</Lozenge>
                          <Badge appearance={scoreMeta.badgeAppearance} max={100}>
                            {issue.score}
                          </Badge>
                        </Inline>
                      </Inline>

                      {issue.blocker?.statusBlocked && (
                        <Text size="small" color={palette.textColor}>
                          Workflow status flag: &ldquo;{issue.status?.name}&rdquo; indicates this work is impeded.
                        </Text>
                      )}

                      {blockedByList.length > 0 && (
                        <Stack space="space.075">
                          <Text size="small" weight="semibold" color={palette.textColor}>
                            Waiting on unresolved issue(s):
                          </Text>
                          {blockedByList.map((dep, idx) => {
                            const isAssignedLocally = Boolean(findIssueByKey(safeIssues, dep.key));
                            return (
                              <Inline
                                key={`${issue.key}-dep-${dep.key}-${idx}`}
                                space="space.100"
                                alignBlock="center"
                                shouldWrap
                              >
                                <Lozenge appearance="warning">{dep.relation || 'blocked by'}</Lozenge>
                                <Code>{dep.key}</Code>
                                <Text size="small" color={palette.textColor}>
                                  {dep.summary || 'Linked issue'} ({dep.status || 'Open'})
                                </Text>
                                {isAssignedLocally && (
                                  <Button
                                    appearance={palette.buttonAppearance}
                                    spacing="compact"
                                    onClick={() => onSelectIssue(dep.key)}
                                  >
                                    Inspect {dep.key}
                                  </Button>
                                )}
                                <Button
                                  appearance={palette.buttonAppearance}
                                  spacing="compact"
                                  iconAfter="shortcut"
                                  onClick={() => onOpenIssue(dep.key)}
                                >
                                  Open {dep.key}
                                </Button>
                              </Inline>
                            );
                          })}
                        </Stack>
                      )}

                      <Inline space="space.100" shouldWrap>
                        <Button
                          appearance="primary"
                          spacing="compact"
                          onClick={() => onSelectIssue(issue.key)}
                        >
                          Inspect Task
                        </Button>
                        <Button
                          appearance={palette.buttonAppearance}
                          spacing="compact"
                          iconAfter="shortcut"
                          onClick={() => onOpenIssue(issue.key)}
                        >
                          Open in Jira
                        </Button>
                      </Inline>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Stack>
      </Box>

      <Box backgroundColor={palette.cardBg} padding="space.200" xcss={cardStyle}>
        <Stack space="space.150">
          <Inline spread="space-between" alignBlock="center" shouldWrap>
            <Inline space="space.100" alignBlock="center">
              <Icon glyph="flag-filled" label="Blocking other work" size="small" color={palette.iconColor} />
              <Heading as="h2" size="medium" color={palette.headingColor}>
                Blocking Other Work ({blockingOthersIssues.length})
              </Heading>
            </Inline>
            <Text size="small" color={palette.subduedTextColor}>
              Completing these tasks unblocks downstream dependencies
            </Text>
          </Inline>

          {blockingOthersIssues.length === 0 ? (
            <Text size="small" color={palette.textColor}>
              None of your active tasks are currently blocking other unresolved issues.
            </Text>
          ) : (
            <Stack space="space.150">
              {blockingOthersIssues.map((issue) => {
                const downstreamList = Array.isArray(issue.blocker?.blocksOthers)
                  ? issue.blocker.blocksOthers
                  : [];
                const scoreMeta = getScorePresentation(issue.score);
                const deadlineAppearance = getDeadlineAppearance(issue.deadline?.status);

                return (
                  <Box
                    key={`blocking-${issue.key}`}
                    backgroundColor={palette.subtleCardBg}
                    padding="space.200"
                    xcss={cardStyle}
                  >
                    <Stack space="space.150">
                      <Inline spread="space-between" alignBlock="center" shouldWrap rowSpace="space.100">
                        <Inline space="space.075" alignBlock="center" shouldWrap>
                          <Code>{issue.key}</Code>
                          <Heading as="h3" size="small" color={palette.headingColor}>
                            {issue.summary}
                          </Heading>
                        </Inline>
                        <Inline space="space.075" alignBlock="center">
                          <Lozenge appearance={deadlineAppearance}>
                            {issue.deadline?.label || 'No due date'}
                          </Lozenge>
                          <Badge appearance={scoreMeta.badgeAppearance} max={100}>
                            {issue.score}
                          </Badge>
                        </Inline>
                      </Inline>

                      <Stack space="space.075">
                        <Text size="small" weight="semibold" color={palette.textColor}>
                          Unblocks downstream issue(s):
                        </Text>
                        {downstreamList.map((downstream, idx) => {
                          const isAssignedLocally = Boolean(
                            findIssueByKey(safeIssues, downstream.key)
                          );
                          return (
                            <Inline
                              key={`${issue.key}-unblocks-${downstream.key}-${idx}`}
                              space="space.100"
                              alignBlock="center"
                              shouldWrap
                            >
                              <Lozenge appearance="discovery">{downstream.relation || 'blocks'}</Lozenge>
                              <Code>{downstream.key}</Code>
                              <Text size="small" color={palette.textColor}>
                                {downstream.summary || 'Linked issue'} ({downstream.status || 'Open'})
                              </Text>
                              {isAssignedLocally && (
                                <Button
                                  appearance={palette.buttonAppearance}
                                  spacing="compact"
                                  onClick={() => onSelectIssue(downstream.key)}
                                >
                                  Inspect {downstream.key}
                                </Button>
                              )}
                              <Button
                                appearance={palette.buttonAppearance}
                                spacing="compact"
                                iconAfter="shortcut"
                                onClick={() => onOpenIssue(downstream.key)}
                              >
                                Open {downstream.key}
                              </Button>
                            </Inline>
                          );
                        })}
                      </Stack>

                      <Inline space="space.100" shouldWrap>
                        <Button
                          appearance="primary"
                          spacing="compact"
                          onClick={() => onSelectIssue(issue.key)}
                        >
                          Inspect Task
                        </Button>
                        <Button
                          appearance={palette.buttonAppearance}
                          spacing="compact"
                          iconAfter="shortcut"
                          onClick={() => onOpenIssue(issue.key)}
                        >
                          Open in Jira
                        </Button>
                      </Inline>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}
