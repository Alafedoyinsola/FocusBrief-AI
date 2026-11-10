import React from 'react';
import {
  Badge,
  Box,
  Button,
  Code,
  Heading,
  Icon,
  Inline,
  List,
  ListItem,
  Lozenge,
  SectionMessage,
  Stack,
  Tag,
  TagGroup,
  Text,
  xcss
} from '@forge/react';
import {
  findIssueByKey,
  formatTimestampInTimeZone,
  getKnowledgeStatusConfig,
  getSafeConfluenceTarget
} from '../briefingViewHelpers.js';

/**
 * ConfluenceKnowledgeSection displays ranked read-only Confluence documentation
 * linked to active Jira tasks and degrades gracefully across all backend states
 * (`ok`, `empty`, `skipped`, `unauthorized`, `unavailable`, `rate_limited`, `error`).
 */
export function ConfluenceKnowledgeSection({
  knowledge,
  issues,
  timeZone,
  palette,
  onSelectIssue,
  onOpenConfluenceDoc
}) {
  const safeIssues = Array.isArray(issues) ? issues : [];
  const config = getKnowledgeStatusConfig(knowledge);

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

  return (
    <Box backgroundColor={palette.cardBg} padding="space.200" xcss={cardStyle}>
      <Stack space="space.200">
        <Inline spread="space-between" alignBlock="center" shouldWrap rowSpace="space.100">
          <Inline space="space.100" alignBlock="center">
            <Icon glyph="pages" label="Confluence knowledge" size="small" color={palette.iconColor} />
            <Heading as="h2" size="medium" color={palette.headingColor}>
              Relevant Confluence Knowledge
            </Heading>
            {config.hasDocuments && (
              <Badge appearance="primary" max={99}>
                {config.returnedCount}
              </Badge>
            )}
          </Inline>
          <Text size="small" color={palette.subduedTextColor}>
            Read-only CQL search matched to your active Jira tasks
          </Text>
        </Inline>

        {config.queryTermsUsed.length > 0 && (
          <Box backgroundColor={palette.hostSurfaceBg} padding="space.150" xcss={hostSurfaceStyle}>
            <Stack space="space.075">
              <Text size="small" weight="semibold" color="color.text.subtle">
                Search keywords extracted from active tasks:
              </Text>
              <TagGroup>
                {config.queryTermsUsed.map((term) => (
                  <Tag key={`cql-term-${term}`} text={term} color="blueLight" isRemovable={false} />
                ))}
              </TagGroup>
            </Stack>
          </Box>
        )}

        {!config.hasDocuments ? (
          <Box backgroundColor={palette.hostSurfaceBg} padding="space.150" xcss={hostSurfaceStyle}>
            <SectionMessage appearance={config.alertAppearance} title={config.alertTitle}>
              <Text>{config.message}</Text>
            </SectionMessage>
          </Box>
        ) : (
          <Stack space="space.150">
            {config.totalFound > config.returnedCount && (
              <Text size="small" color={palette.subduedTextColor}>
                Showing top {config.returnedCount} ranked pages out of {config.totalFound} Confluence search matches.
              </Text>
            )}

            {config.documents.map((doc, idx) => {
              const safeUrl = getSafeConfluenceTarget(doc);
              const spaceLabel = doc.space?.name || doc.space?.key || 'Confluence';
              const matchedKeys = Array.isArray(doc.matchedIssueKeys) ? doc.matchedIssueKeys : [];
              const docReasons = Array.isArray(doc.reasons) ? doc.reasons : [];

              return (
                <Box
                  key={doc.id || doc.webUrlPath || `doc-${idx}`}
                  backgroundColor={palette.subtleCardBg}
                  padding="space.200"
                  xcss={cardStyle}
                >
                  <Stack space="space.150">
                    <Inline spread="space-between" alignBlock="center" shouldWrap rowSpace="space.100">
                      <Stack space="space.050">
                        <Inline space="space.075" alignBlock="center" shouldWrap>
                          <Lozenge appearance="information">{spaceLabel}</Lozenge>
                          <Heading as="h3" size="small" color={palette.headingColor}>
                            {doc.title}
                          </Heading>
                        </Inline>
                        <Text size="small" color={palette.subduedTextColor}>
                          Last modified: {formatTimestampInTimeZone(doc.lastModified, timeZone)}
                        </Text>
                      </Stack>

                      <Inline space="space.100" alignBlock="center">
                        <Badge appearance="important" max={100}>
                          {doc.relevanceScore}
                        </Badge>
                        {safeUrl && (
                          <Button
                            appearance="primary"
                            spacing="compact"
                            iconAfter="shortcut"
                            onClick={() => onOpenConfluenceDoc(doc)}
                          >
                            Open Page
                          </Button>
                        )}
                      </Inline>
                    </Inline>

                    {doc.excerpt && (
                      <Text size="small" color={palette.textColor}>
                        {doc.excerpt}
                      </Text>
                    )}

                    {matchedKeys.length > 0 && (
                      <Inline space="space.075" alignBlock="center" shouldWrap>
                        <Text size="small" weight="semibold" color={palette.textColor}>
                          Matched Jira task(s):
                        </Text>
                        {matchedKeys.map((issueKey) => {
                          const assigned = Boolean(findIssueByKey(safeIssues, issueKey));
                          return assigned ? (
                            <Button
                              key={`${doc.id}-match-${issueKey}`}
                              appearance={palette.buttonAppearance}
                              spacing="compact"
                              onClick={() => onSelectIssue(issueKey)}
                            >
                              Inspect {issueKey}
                            </Button>
                          ) : (
                            <Code key={`${doc.id}-code-${issueKey}`}>{issueKey}</Code>
                          );
                        })}
                      </Inline>
                    )}

                    {docReasons.length > 0 && (
                      <Stack space="space.050">
                        <Text size="small" weight="semibold" color={palette.textColor}>
                          Why this page surfaced:
                        </Text>
                        <List type="unordered">
                          {docReasons.map((reason, reasonIdx) => (
                            <ListItem key={`${doc.id}-reason-${reasonIdx}`}>
                              <Text size="small" color={palette.textColor}>
                                {reason}
                              </Text>
                            </ListItem>
                          ))}
                        </List>
                      </Stack>
                    )}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
