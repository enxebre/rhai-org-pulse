/**
 * @param {import('express').Router} router
 * @param {import('@shared/server/module-context').ModuleContext} context
 */
module.exports = function registerRoutes(router, context) {
  const { storage, requireAdmin, requireScope } = context;
  const { readFromStorage, writeToStorage } = storage;

  context.registerScopes([
    { key: 'jira-solve-agent:read', label: 'OpenShift Jira Solve Agent (Read)', description: 'Read agent data', category: 'OpenShift Jira Solve Agent' },
    { key: 'jira-solve-agent:write', label: 'OpenShift Jira Solve Agent (Write)', description: 'Refresh agent data', category: 'OpenShift Jira Solve Agent' }
  ]);

  const DEMO_MODE = process.env.DEMO_MODE === 'true';

  const { createJiraClient } = require('../../../shared/server/jira');
  const jira = createJiraClient({
    email: (context.secrets && context.secrets.JIRA_EMAIL) || '',
    token: (context.secrets && context.secrets.JIRA_TOKEN) || '',
    host: process.env.JIRA_HOST
  });
  const { jiraRequest, JIRA_HOST } = jira;

  const { fetchAgentData, computeMetrics } = require('./jira/fetcher');

  /**
   * @openapi
   * /api/modules/jira-solve-agent/data:
   *   get:
   *     tags: [OpenShift Jira Solve Agent]
   *     summary: Get cached OpenShift Jira Solve Agent data with computed metrics
   *     responses:
   *       200:
   *         description: Agent data with metrics and issues
   */
  router.get('/data', requireScope('jira-solve-agent:read'), function(req, res) {
    const data = readFromStorage('jira-solve-agent/data.json');
    if (!data || !data.issues) {
      return res.json({
        fetchedAt: null,
        jiraHost: JIRA_HOST,
        metrics: { totalIssues: 0, byState: {}, processedCount: 0, processedRate: 0 },
        issues: []
      });
    }

    const metrics = computeMetrics(data.issues);

    res.json({
      fetchedAt: data.fetchedAt,
      jiraHost: JIRA_HOST,
      metrics,
      issues: data.issues
    });
  });

  const refreshState = { running: false, lastResult: null };

  /**
   * @openapi
   * /api/modules/jira-solve-agent/refresh:
   *   post:
   *     tags: [OpenShift Jira Solve Agent]
   *     summary: Fetch fresh OpenShift Jira Solve Agent data from Jira and update cache
   *     responses:
   *       200:
   *         description: Refresh completed
   */
  router.post('/refresh', requireAdmin, requireScope('jira-solve-agent:write'), async function(req, res) {
    if (refreshState.running) {
      return res.status(409).json({ error: 'Refresh already running' });
    }

    refreshState.running = true;
    try {
      await runRefresh();
      res.json({ status: 'ok', result: refreshState.lastResult });
    } catch (err) {
      console.error('[jira-solve-agent] Refresh failed:', err);
      refreshState.lastResult = {
        status: 'error',
        message: err.message,
        completedAt: new Date().toISOString()
      };
      res.status(500).json({ error: err.message });
    } finally {
      refreshState.running = false;
    }
  });

  async function runRefresh() {
    if (DEMO_MODE) return;

    const githubToken = (context.secrets && context.secrets.GITHUB_TOKEN) || '';
    const issues = await fetchAgentData(jiraRequest, githubToken);
    writeToStorage('jira-solve-agent/data.json', {
      fetchedAt: new Date().toISOString(),
      issues
    });

    refreshState.lastResult = {
      status: 'ok',
      issueCount: issues.length,
      completedAt: new Date().toISOString()
    };
  }

  if (context.registerRefresh) {
    context.registerRefresh('refresh', {
      order: 60,
      timeout: 300000,
      handler: async function() {
        await runRefresh();
      }
    });
  }

  context.registerDiagnostics(async function() {
    const data = readFromStorage('jira-solve-agent/data.json');
    return {
      status: data && data.issues ? 'ok' : 'no-data',
      issueCount: data && data.issues ? data.issues.length : 0,
      fetchedAt: data ? data.fetchedAt : null
    };
  });
};
