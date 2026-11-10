import React, { useCallback, useEffect, useRef, useState } from 'react';
import ForgeReconciler, {
  Box,
  EmptyState,
  LoadingButton,
  SectionMessage,
  Spinner,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  useTheme,
  xcss
} from '@forge/react';
import { invoke, router } from '@forge/bridge';
import {
  findIssueByKey,
  getThemeSurfacePalette,
  openConfluenceDocWithRouter,
  openJiraIssueWithRouter
} from './briefingViewHelpers.js';
import { DashboardHeader } from './components/DashboardHeader.jsx';
import { OverviewSection } from './components/OverviewSection.jsx';
import { PrioritiesSection } from './components/PrioritiesSection.jsx';
import { BlockerRadarSection } from './components/BlockerRadarSection.jsx';
import { RecentSignalsSection } from './components/RecentSignalsSection.jsx';
import { ConfluenceKnowledgeSection } from './components/ConfluenceKnowledgeSection.jsx';
import { IssueDetailModal } from './components/IssueDetailModal.jsx';

/**
 * Root FocusBrief AI Global Page component.
 *
 * Orchestrates:
 * - Automatic Jira host theme synchronization via Forge UI Kit `useTheme()`
 *   and semantic Atlassian Design System surface tokens.
 * - Initial and manual `getDailyBriefing` invocation with duplicate-request protection
 *   and non-destructive refresh failure handling.
 * - Interactive tabs, task inspection modal, and native Forge `router.open()` navigation.
 */
const App = () => {
  const hostTheme = useTheme();
  const [briefing, setBriefing] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(null);
  const [navigationWarning, setNavigationWarning] = useState(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedIssueKey, setSelectedIssueKey] = useState(null);

  const inFlightRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadBriefing = useCallback(async ({ isRefresh = false } = {}) => {
    if (inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    if (isRefresh) {
      setIsRefreshing(true);
      setRefreshError(null);
    } else {
      setIsLoading(true);
      setLoadError(null);
    }
    setNavigationWarning(null);

    try {
      const payload = await invoke('getDailyBriefing');
      if (!isMountedRef.current) {
        return;
      }

      if (payload && payload.success === true) {
        setBriefing(payload);
        setLoadError(null);
        setRefreshError(null);
      } else {
        const errorMessage =
          payload?.error?.message ||
          'Unable to load your daily briefing. Please check Jira permissions and try again.';

        if (isRefresh) {
          setRefreshError(errorMessage);
        } else {
          setLoadError(errorMessage);
        }
      }
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }
      console.error('Failed to invoke getDailyBriefing resolver:', err);
      const fallbackMessage =
        'Unable to reach the FocusBrief AI briefing service right now. Please try again.';
      if (isRefresh) {
        setRefreshError(fallbackMessage);
      } else {
        setLoadError(fallbackMessage);
      }
    } finally {
      inFlightRef.current = false;
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadBriefing({ isRefresh: false });
  }, [loadBriefing]);

  const palette = getThemeSurfacePalette(hostTheme?.colorMode);

  const handleOpenIssue = async (issueKey) => {
    const ok = await openJiraIssueWithRouter(issueKey, router);
    if (!ok && isMountedRef.current) {
      setNavigationWarning(`Unable to open Jira issue ${issueKey} via Forge router.`);
    }
  };

  const handleOpenConfluenceDoc = async (doc) => {
    const ok = await openConfluenceDocWithRouter(doc, router);
    if (!ok && isMountedRef.current) {
      setNavigationWarning('Unable to open that Confluence page link.');
    }
  };

  const pageContainerStyle = xcss({
    borderRadius: 'radius.large'
  });

  const hostPanelStyle = xcss({
    borderColor: palette.borderColor,
    borderStyle: 'solid',
    borderWidth: 'border.width',
    borderRadius: 'radius.medium'
  });

  if (isLoading && !briefing) {
    return (
      <Box backgroundColor={palette.hostSurfaceBg} padding="space.600">
        <Stack space="space.200" alignInline="center">
          <Spinner size="large" label="Loading FocusBrief AI daily briefing" />
          <Text size="medium" weight="medium">
            Analyzing your assigned Jira tasks, blockers, and Confluence docs...
          </Text>
        </Stack>
      </Box>
    );
  }

  if (!briefing && loadError) {
    return (
      <Box backgroundColor={palette.hostSurfaceBg} padding="space.400">
        <EmptyState
          header="Unable to load your daily briefing"
          description={loadError}
          primaryAction={
            <LoadingButton
              appearance="primary"
              isLoading={isLoading}
              onClick={() => loadBriefing({ isRefresh: false })}
              testId="retry-initial-load-button"
            >
              Try Again
            </LoadingButton>
          }
        />
      </Box>
    );
  }

  if (!briefing) {
    return null;
  }

  const issues = Array.isArray(briefing.issues) ? briefing.issues : [];
  const selectedIssue = findIssueByKey(issues, selectedIssueKey);
  const blockedCount = issues.filter((item) => Boolean(item.blocker?.isBlocked)).length;
  const blockingOthersCount = issues.filter(
    (item) =>
      Array.isArray(item.blocker?.blocksOthersKeys) && item.blocker.blocksOthersKeys.length > 0
  ).length;
  const docCount = Array.isArray(briefing.knowledge?.documents)
    ? briefing.knowledge.documents.length
    : 0;

  return (
    <Box backgroundColor={palette.pageBg} padding="space.250" xcss={pageContainerStyle}>
      <Stack space="space.250">
        <DashboardHeader
          user={briefing.user}
          briefingDate={briefing.briefingDate}
          timeZone={briefing.timeZone}
          metadata={briefing.metadata}
          palette={palette}
          isRefreshing={isRefreshing}
          refreshError={refreshError}
          onRefresh={() => loadBriefing({ isRefresh: true })}
        />

        {navigationWarning && (
          <Box backgroundColor={palette.hostSurfaceBg} padding="space.150" xcss={hostPanelStyle}>
            <SectionMessage appearance="warning" title="Navigation warning">
              <Text>{navigationWarning}</Text>
            </SectionMessage>
          </Box>
        )}

        <OverviewSection
          briefing={briefing}
          palette={palette}
          onSelectIssue={(issueKey) => setSelectedIssueKey(issueKey)}
        />

        {/* Wrap Tabs bar shell on `elevation.surface` so Tab labels always stay legible in Jira's host theme */}
        <Box backgroundColor={palette.hostSurfaceBg} padding="space.150" xcss={hostPanelStyle}>
          <Tabs
            id="focusbrief-main-tabs"
            selected={selectedTab}
            onChange={(index) => setSelectedTab(index)}
            testId="focusbrief-tabs"
          >
            <TabList>
              <Tab>Your Priorities ({issues.length})</Tab>
              <Tab>Blocker &amp; Impact Radar ({blockedCount + blockingOthersCount})</Tab>
              <Tab>What Changed &amp; Knowledge ({docCount})</Tab>
            </TabList>

            <TabPanel>
              <Box backgroundColor={palette.pageBg} padding="space.200" xcss={pageContainerStyle}>
                <PrioritiesSection
                  briefing={briefing}
                  palette={palette}
                  onSelectIssue={(issueKey) => setSelectedIssueKey(issueKey)}
                  onOpenIssue={handleOpenIssue}
                />
              </Box>
            </TabPanel>

            <TabPanel>
              <Box backgroundColor={palette.pageBg} padding="space.200" xcss={pageContainerStyle}>
                <BlockerRadarSection
                  issues={issues}
                  palette={palette}
                  onSelectIssue={(issueKey) => setSelectedIssueKey(issueKey)}
                  onOpenIssue={handleOpenIssue}
                />
              </Box>
            </TabPanel>

            <TabPanel>
              <Box backgroundColor={palette.pageBg} padding="space.200" xcss={pageContainerStyle}>
                <Stack space="space.250">
                  <RecentSignalsSection
                    briefing={briefing}
                    palette={palette}
                    onSelectIssue={(issueKey) => setSelectedIssueKey(issueKey)}
                    onOpenIssue={handleOpenIssue}
                  />
                  <ConfluenceKnowledgeSection
                    knowledge={briefing.knowledge}
                    issues={issues}
                    timeZone={briefing.timeZone || briefing.user?.timeZone}
                    palette={palette}
                    onSelectIssue={(issueKey) => setSelectedIssueKey(issueKey)}
                    onOpenConfluenceDoc={handleOpenConfluenceDoc}
                  />
                </Stack>
              </Box>
            </TabPanel>
          </Tabs>
        </Box>

        <IssueDetailModal
          issue={selectedIssue}
          allIssues={issues}
          knowledge={briefing.knowledge}
          timeZone={briefing.timeZone || briefing.user?.timeZone}
          onClose={() => setSelectedIssueKey(null)}
          onSelectIssue={(issueKey) => setSelectedIssueKey(issueKey)}
          onOpenIssue={handleOpenIssue}
          onOpenConfluenceDoc={handleOpenConfluenceDoc}
        />
      </Stack>
    </Box>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
