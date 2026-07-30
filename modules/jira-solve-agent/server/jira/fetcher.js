const fetch = require('node-fetch');
const { fetchAllJqlResults } = require('../../../../shared/server/jira');

const PROJECTS = ['OCPBUGS', 'CNTRLPLANE', 'TRT'];
const AGENT_LABEL = 'issue-for-agent';
const PROCESSED_LABEL = 'agent-processed';
const READY_TO_SOLVE_LABEL = 'ready-to-solve';

const FIELDS = 'summary,status,issuetype,priority,created,updated,labels,components,assignee';

const GITHUB_PR_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 200;

function parsePrUrl(url) {
  if (!url) return null;
  const m = url.match(GITHUB_PR_RE);
  if (m) return { owner: m[1], repo: m[2], number: m[3] };
  return null;
}

async function fetchGithubPrState(owner, repo, number, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`;
  try {
    const headers = { 'User-Agent': 'rhai-org-pulse' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (res.status === 403 || res.status === 429) return { state: null, rateLimited: true };
    if (!res.ok) return { state: null, rateLimited: false };
    const data = await res.json();
    if (data.merged) return { state: 'merged', rateLimited: false };
    if (data.state === 'open') return { state: 'opened', rateLimited: false };
    if (data.state === 'closed') return { state: 'closed', rateLimited: false };
    return { state: null, rateLimited: false };
  } catch {
    return { state: null, rateLimited: false };
  }
}

async function fetchRemoteLinks(jiraRequest, issueKey) {
  try {
    const links = await jiraRequest(`/rest/api/3/issue/${issueKey}/remotelink`);
    return links || [];
  } catch {
    return [];
  }
}

function extractPrUrls(remoteLinks) {
  const urls = [];
  for (const link of remoteLinks) {
    const url = link.object?.url;
    if (url && GITHUB_PR_RE.test(url)) urls.push(url);
  }
  return urls;
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function classifyIssue(statusCategory, labels) {
  const category = (statusCategory || '').toLowerCase();
  const labelSet = new Set(labels);

  if (category === 'done') {
    return 'closed';
  }
  if (category === 'in progress') {
    return 'in-progress';
  }
  if (category === 'to do' || category === 'new') {
    if (labelSet.has(READY_TO_SOLVE_LABEL)) return 'ready-to-solve';
    return 'new';
  }
  return 'other';
}

function processIssue(issue) {
  const labels = issue.fields.labels || [];
  const statusName = issue.fields.status?.name || 'Unknown';
  const statusCategory = issue.fields.status?.statusCategory?.name || '';
  const components = (issue.fields.components || []).map(c => c.name);

  return {
    key: issue.key,
    summary: issue.fields.summary,
    status: statusName,
    issueType: issue.fields.issuetype?.name || 'Unknown',
    priority: issue.fields.priority?.name || 'None',
    created: issue.fields.created,
    updated: issue.fields.updated,
    labels,
    components,
    assignee: issue.fields.assignee?.displayName || null,
    agentState: classifyIssue(statusCategory, labels),
    processed: labels.includes(PROCESSED_LABEL)
  };
}

function computeMetrics(issues) {
  const byState = { new: 0, 'ready-to-solve': 0, 'in-progress': 0, closed: 0, other: 0 };
  let processedCount = 0;
  let mergedCount = 0;

  for (const issue of issues) {
    byState[issue.agentState] = (byState[issue.agentState] || 0) + 1;
    if (issue.processed) processedCount++;
    if (issue.prMerged) mergedCount++;
  }

  const totalIssues = issues.length;
  const closedCount = byState.closed || 0;
  const processedRate = totalIssues > 0
    ? Math.round((processedCount / totalIssues) * 100)
    : 0;
  const mergeRate = closedCount > 0
    ? Math.round((mergedCount / closedCount) * 100)
    : 0;

  return {
    totalIssues,
    byState,
    processedCount,
    processedRate,
    mergedCount,
    mergeRate
  };
}

async function enrichWithPrStatus(issues, jiraRequest, githubToken) {
  if (issues.length === 0) return;

  for (let i = 0; i < issues.length; i += BATCH_SIZE) {
    const batch = issues.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (issue) => {
      const links = await fetchRemoteLinks(jiraRequest, issue.key);
      issue.prLinks = extractPrUrls(links);
    }));
    if (i + BATCH_SIZE < issues.length) await delay(BATCH_DELAY_MS);
  }

  const uniquePrs = new Map();
  for (const issue of issues) {
    for (const url of issue.prLinks) {
      if (uniquePrs.has(url)) continue;
      const parsed = parsePrUrl(url);
      if (parsed) uniquePrs.set(url, parsed);
    }
  }

  const prStateMap = {};
  const entries = [...uniquePrs.entries()];
  let rateLimited = false;
  for (let i = 0; i < entries.length && !rateLimited; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async ([url, pr]) => {
        const result = await fetchGithubPrState(pr.owner, pr.repo, pr.number, githubToken);
        return { url, ...result };
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value.rateLimited) rateLimited = true;
        if (r.value.state) prStateMap[r.value.url] = r.value.state;
      }
    }
    if (i + BATCH_SIZE < entries.length && !rateLimited) await delay(BATCH_DELAY_MS);
  }

  if (rateLimited) {
    console.warn('[jira-solve-agent] GitHub API rate limited — PR status data incomplete. Set GITHUB_TOKEN for higher limits.');
  }

  for (const issue of issues) {
    issue.prMerged = issue.prLinks.some(url => prStateMap[url] === 'merged');
  }
}

async function fetchAgentData(jiraRequest, githubToken) {
  const projectClause = PROJECTS.map(p => `"${p}"`).join(', ');
  const jql = `project IN (${projectClause}) AND labels = "${AGENT_LABEL}" ORDER BY created DESC`;

  const rawIssues = await fetchAllJqlResults(jiraRequest, jql, FIELDS);
  const issues = rawIssues.map(processIssue);

  try {
    await enrichWithPrStatus(issues, jiraRequest, githubToken);
  } catch (err) {
    console.warn('[jira-solve-agent] PR status enrichment failed:', err.message);
  }

  return issues;
}

module.exports = {
  fetchAgentData,
  processIssue,
  classifyIssue,
  computeMetrics,
  PROJECTS,
  AGENT_LABEL,
  PROCESSED_LABEL,
  READY_TO_SOLVE_LABEL
};
