import React from 'react';
import {
  Badge,
  Box,
  Button,
  Code,
  Heading,
  Image,
  Inline,
  List,
  ListItem,
  Lozenge,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  ProgressBar,
  SectionMessage,
  Stack,
  Text,
  xcss
} from '@forge/react';
import {
  findIssueByKey,
  formatTimestampInTimeZone,
  getDeadlineAppearance,
  getSafeConfluenceTarget,
  getScorePresentation,
  getStatusAppearance,
  isSafeHttpsUrl
} from '../briefingViewHelpers.js';

/**
 * IssueDetailModal renders a host-themed inspection dialog when a user selects
 * any Jira issue across the Overview, Priorities, Blocker Radar, Recent Activity,
 * or Confluence sections without leaving FocusBrief AI.
 */
export function IssueDetailModal({
  issue,
  allIssues,
  knowledge,
  timeZone,
  onClose,
  onSelectIssue,
  onOpenIssue,
  onOpenConfluenceDoc
}) {
  const safeIssues = Array.isArray(allIssues) ? allIssues : [];
  const subCardStyle = xcss({
    borderColor: 'color.border',
    borderStyle: 'solid',
    borderWidth: 'border.width',
    borderRadius: 'radius.medium'
  });

  // Collect matched Confluence documents specifically referencing this issue key
  const allDocs = Array.isArray(knowledge?.documents) ? knowledge.documents : [];
  const relatedDocs = issue
    ? allDocs.filter(
        (doc) =>
          Array.isArray(doc.matchedIssueKeys) &&
          doc.matchedIssueKeys.some(
            (key) => typeof key === 'string' && key.toLowerCase() === issue.key?.toLowerCase()
          )
      )
    : [];

  const renderIssueContent = () => {
    if (!issue) {
      return null;
    }

    const scoreMeta = getScorePresentation(issue.score);
    const deadlineAppearance = getDeadlineAppearance(issue.deadline?.status);
    const statusAppearance = getStatusAppearance(
      issue.status?.statusCategoryKey,
      issue.status?.category
    );
    const blockedBy = Array.isArray(issue.blocker?.blockedBy) ? issue.blocker.blockedBy : [];
    const blocksOthers = Array.isArray(issue.blocker?.blocksOthers)
      ? issue.blocker.blocksOthers
      : [];
    const reasons = Array.isArray(issue.reasons) ? issue.reasons : [];
    const issueLinks = Array.isArray(issue.issueLinks) ? issue.issueLinks : [];
    const normalizedScoreRatio = Math.max(0, Math.min(1, (issue.score || 0) / 100));

    return (
      <Stack space="space.200">
        <Inline space="space.075" alignBlock="center" shouldWrap>
          <Code>{issue.key}</Code>
          <Lozenge appearance={statusAppearance}>{issue.status?.name || 'Unknown'}</Lozenge>
          <Lozenge appearance={deadlineAppearance}>
            {issue.deadline?.label || 'No due date set'}
          </Lozenge>
          {issue.blocker?.isBlocked && <Lozenge appearance="danger">Blocked</Lozenge>}
          {blocksOthers.length > 0 && (
            <Lozenge appearance="discovery">Blocks {blocksOthers.length} task(s)</Lozenge>
          )}
        </Inline>

        <Heading as="h2" size="medium">
          {issue.summary}
        </Heading>

        <Box backgroundColor="elevation.surface.sunken" padding="space.150" xcss={subCardStyle}>
          <Stack space="space.100">
            <Inline spread="space-between" alignBlock="center" shouldWrap>
              <Inline space="space.075" alignBlock="center">
                <Text size="small" weight="semibold">
                  Priority Score
                </Text>
                <Badge appearance={scoreMeta.badgeAppearance} max={100}>
                  {issue.score}
                </Badge>
                <Text size="small" color="color.text.subtle">
                  / 100 ({scoreMeta.label})
                </Text>
              </Inline>
              {issue.project?.name && (
                <Text size="small" color="color.text.subtle">
                  Project: {issue.project.name} ({issue.project.key})
                </Text>
              )}
            </Inline>
            <ProgressBar
              value={normalizedScoreRatio}
              appearance={scoreMeta.progressAppearance}
              ariaLabel={`Priority score ${issue.score} out of 100`}
            />
            {reasons.length > 0 && (
              <List type="unordered">
                {reasons.map((reason, idx) => (
                  <ListItem key={`modal-reason-${idx}`}>
                    <Text size="small">{reason}</Text>
                  </ListItem>
                ))}
              </List>
            )}
          </Stack>
        </Box>

        <Inline space="space.200" shouldWrap rowSpace="space.100">
          <Inline space="space.075" alignBlock="center">
            {isSafeHttpsUrl(issue.issueType?.iconUrl) && (
              <Image src={issue.issueType.iconUrl} alt={issue.issueType.name || 'Issue type'} size="xsmall" />
            )}
            <Text size="small">
              Type: {issue.issueType?.name || 'Task'}
            </Text>
          </Inline>
          <Inline space="space.075" alignBlock="center">
            {isSafeHttpsUrl(issue.priority?.iconUrl) && (
              <Image src={issue.priority.iconUrl} alt={issue.priority.name || 'Priority'} size="xsmall" />
            )}
            <Text size="small">
              Priority: {issue.priority?.name || 'Medium'}
            </Text>
          </Inline>
          <Text size="small" color="color.text.subtle">
            Due date: {issue.deadline?.dueDate || 'Not set'}
          </Text>
          <Text size="small" color="color.text.subtle">
            Updated: {formatTimestampInTimeZone(issue.updated, timeZone)}
          </Text>
        </Inline>

        {issue.blocker?.statusBlocked && (
          <SectionMessage appearance="warning" title="Workflow Status Blocker">
            <Text>
              Current Jira status &ldquo;{issue.status?.name}&rdquo; indicates this issue is blocked.
            </Text>
          </SectionMessage>
        )}

        {blockedBy.length > 0 && (
          <Box backgroundColor="elevation.surface.raised" padding="space.150" xcss={subCardStyle}>
            <Stack space="space.100">
              <Heading as="h3" size="xsmall">
                Blocked By ({blockedBy.length})
              </Heading>
              {blockedBy.map((dep, idx) => {
                const localTarget = findIssueByKey(safeIssues, dep.key);
                return (
                  <Inline
                    key={`modal-blockedby-${dep.key}-${idx}`}
                    spread="space-between"
                    alignBlock="center"
                    shouldWrap
                    rowSpace="space.075"
                  >
                    <Inline space="space.075" alignBlock="center" shouldWrap>
                      <Lozenge appearance="warning">{dep.relation || 'blocked by'}</Lozenge>
                      <Code>{dep.key}</Code>
                      <Text size="small">
                        {dep.summary || 'Linked issue'} ({dep.status || 'Open'})
                      </Text>
                    </Inline>
                    <Inline space="space.075">
                      {localTarget && (
                        <Button
                          appearance="default"
                          spacing="compact"
                          onClick={() => onSelectIssue(dep.key)}
                        >
                          Inspect
                        </Button>
                      )}
                      <Button
                        appearance="subtle"
                        spacing="compact"
                        iconAfter="shortcut"
                        onClick={() => onOpenIssue(dep.key)}
                      >
                        Open
                      </Button>
                    </Inline>
                  </Inline>
                );
              })}
            </Stack>
          </Box>
        )}

        {blocksOthers.length > 0 && (
          <Box backgroundColor="elevation.surface.raised" padding="space.150" xcss={subCardStyle}>
            <Stack space="space.100">
              <Heading as="h3" size="xsmall">
                Blocks Downstream Work ({blocksOthers.length})
              </Heading>
              {blocksOthers.map((dep, idx) => {
                const localTarget = findIssueByKey(safeIssues, dep.key);
                return (
                  <Inline
                    key={`modal-blocks-${dep.key}-${idx}`}
                    spread="space-between"
                    alignBlock="center"
                    shouldWrap
                    rowSpace="space.075"
                  >
                    <Inline space="space.075" alignBlock="center" shouldWrap>
                      <Lozenge appearance="discovery">{dep.relation || 'blocks'}</Lozenge>
                      <Code>{dep.key}</Code>
                      <Text size="small">
                        {dep.summary || 'Linked issue'} ({dep.status || 'Open'})
                      </Text>
                    </Inline>
                    <Inline space="space.075">
                      {localTarget && (
                        <Button
                          appearance="default"
                          spacing="compact"
                          onClick={() => onSelectIssue(dep.key)}
                        >
                          Inspect
                        </Button>
                      )}
                      <Button
                        appearance="subtle"
                        spacing="compact"
                        iconAfter="shortcut"
                        onClick={() => onOpenIssue(dep.key)}
                      >
                        Open
                      </Button>
                    </Inline>
                  </Inline>
                );
              })}
            </Stack>
          </Box>
        )}

        {issueLinks.length > 0 && (
          <Box backgroundColor="elevation.surface.raised" padding="space.150" xcss={subCardStyle}>
            <Stack space="space.075">
              <Heading as="h3" size="xsmall">
                All Jira Issue Links ({issueLinks.length})
              </Heading>
              {issueLinks.map((link, idx) => {
                const target = link.inwardIssue || link.outwardIssue;
                const relation = link.inwardIssue
                  ? link.type?.inward || link.type?.name
                  : link.type?.outward || link.type?.name;
                if (!target) {
                  return null;
                }
                return (
                  <Inline
                    key={link.id || `raw-link-${idx}`}
                    spread="space-between"
                    alignBlock="center"
                    shouldWrap
                    rowSpace="space.050"
                  >
                    <Inline space="space.075" alignBlock="center" shouldWrap>
                      <Lozenge appearance="neutral">{relation || 'relates to'}</Lozenge>
                      <Code>{target.key}</Code>
                      <Text size="small">
                        {target.summary || ''} ({target.status || 'Unknown'})
                      </Text>
                    </Inline>
                    <Button
                      appearance="subtle"
                      spacing="compact"
                      iconAfter="shortcut"
                      onClick={() => onOpenIssue(target.key)}
                    >
                      Open
                    </Button>
                  </Inline>
                );
              })}
            </Stack>
          </Box>
        )}

        {relatedDocs.length > 0 && (
          <Box backgroundColor="elevation.surface.raised" padding="space.150" xcss={subCardStyle}>
            <Stack space="space.100">
              <Heading as="h3" size="xsmall">
                Related Confluence Documentation ({relatedDocs.length})
              </Heading>
              {relatedDocs.map((doc, idx) => (
                <Inline
                  key={doc.id || `modal-doc-${idx}`}
                  spread="space-between"
                  alignBlock="center"
                  shouldWrap
                  rowSpace="space.075"
                >
                  <Stack space="space.025">
                    <Text size="small" weight="semibold">
                      {doc.title}
                    </Text>
                    {doc.excerpt && (
                      <Text size="small" color="color.text.subtle" maxLines={2}>
                        {doc.excerpt}
                      </Text>
                    )}
                  </Stack>
                  {getSafeConfluenceTarget(doc) && (
                    <Button
                      appearance="default"
                      spacing="compact"
                      iconAfter="shortcut"
                      onClick={() => onOpenConfluenceDoc(doc)}
                    >
                      Open Page
                    </Button>
                  )}
                </Inline>
              ))}
            </Stack>
          </Box>
        )}
      </Stack>
    );
  };

  return (
    <ModalTransition>
      {issue && (
        <Modal
          onClose={onClose}
          width="large"
          shouldScrollInViewport
          testId="issue-detail-modal"
        >
          <ModalHeader>
            <ModalTitle>Task Inspection — {issue.key}</ModalTitle>
          </ModalHeader>
          <ModalBody hasInlinePadding>{renderIssueContent()}</ModalBody>
          <ModalFooter>
            <Button appearance="subtle" onClick={onClose} testId="modal-close-button">
              Close
            </Button>
            <Button
              appearance="primary"
              iconAfter="shortcut"
              onClick={() => onOpenIssue(issue.key)}
              testId="modal-open-jira-button"
            >
              Open {issue.key} in Jira
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </ModalTransition>
  );
}
