<template>
  <div>
    <LoadingOverlay v-if="loading && !agentData" message="Loading agent data..." />

    <div v-else-if="error" class="p-8 text-center">
      <p class="text-red-600 dark:text-red-400 mb-4">{{ error }}</p>
      <button class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700" @click="$emit('retry')">
        Retry
      </button>
    </div>

    <div v-else-if="!agentData || !agentData.issues || agentData.issues.length === 0" class="p-8 text-center text-gray-500 dark:text-gray-400">
      <p class="text-lg font-medium mb-2">No data available</p>
      <p class="text-sm">Trigger a refresh to fetch issues from Jira.</p>
    </div>

    <template v-else>
      <!-- Team selector with inline stats -->
      <div class="px-6 pt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <button
          v-for="team in teamOptions"
          :key="team.key"
          :class="[
            'px-3 py-3 rounded-lg border transition-colors text-left overflow-hidden',
            selectedTeam === team.key
              ? 'bg-primary-600 text-white border-primary-600 shadow-md'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
          ]"
          @click="selectedTeam = team.key"
        >
          <div class="text-sm font-semibold mb-2 truncate">{{ team.label }}</div>
          <div class="flex items-center gap-2 min-w-0">
            <div class="text-center min-w-0 flex-1">
              <div :class="['text-lg font-bold leading-tight', selectedTeam === team.key ? 'text-white' : 'text-gray-900 dark:text-gray-100']">{{ teamStats(team.key).total }}</div>
              <div :class="['text-[9px] uppercase tracking-wider leading-tight', selectedTeam === team.key ? 'text-white/60' : 'text-gray-400 dark:text-gray-500']">total</div>
            </div>
            <div :class="['w-px h-7 flex-shrink-0', selectedTeam === team.key ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700']"></div>
            <div class="text-center min-w-0 flex-1">
              <div :class="['text-lg font-bold leading-tight', selectedTeam === team.key ? 'text-white' : 'text-amber-600 dark:text-amber-400']">{{ teamStats(team.key).inProgress }}</div>
              <div :class="['text-[9px] uppercase tracking-wider leading-tight', selectedTeam === team.key ? 'text-white/60' : 'text-gray-400 dark:text-gray-500']">wip</div>
            </div>
            <div :class="['w-px h-7 flex-shrink-0', selectedTeam === team.key ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700']"></div>
            <div class="text-center min-w-0 flex-1">
              <div :class="['text-lg font-bold leading-tight', selectedTeam === team.key ? 'text-white' : 'text-green-600 dark:text-green-400']">{{ teamStats(team.key).merged }}</div>
              <div :class="['text-[9px] uppercase tracking-wider leading-tight', selectedTeam === team.key ? 'text-white/60' : 'text-gray-400 dark:text-gray-500']">merged</div>
            </div>
            <div :class="['w-px h-7 flex-shrink-0', selectedTeam === team.key ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700']"></div>
            <div class="text-center min-w-0 flex-1">
              <div :class="['text-lg font-bold leading-tight', selectedTeam === team.key ? 'text-white' : 'text-gray-500 dark:text-gray-400']">{{ teamStats(team.key).closed }}</div>
              <div :class="['text-[9px] uppercase tracking-wider leading-tight', selectedTeam === team.key ? 'text-white/60' : 'text-gray-400 dark:text-gray-500']">closed</div>
            </div>
          </div>
        </button>
      </div>

      <!-- Stat cards -->
      <div class="p-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ displayMetrics.totalIssues }}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 uppercase tracking-wide">Total Issues</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">{{ displayMetrics.byState.new || 0 }}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 uppercase tracking-wide">New</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{{ displayMetrics.byState['ready-to-solve'] || 0 }}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 uppercase tracking-wide">Ready to Solve</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div class="text-2xl font-bold text-amber-600 dark:text-amber-400">{{ displayMetrics.byState['in-progress'] || 0 }}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 uppercase tracking-wide">In Progress</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div class="text-2xl font-bold text-green-600 dark:text-green-400">{{ displayMetrics.mergedCount || 0 }}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 uppercase tracking-wide">Merged</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div class="text-2xl font-bold text-gray-600 dark:text-gray-400">{{ displayMetrics.byState.closed || 0 }}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 uppercase tracking-wide">Closed</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">{{ displayMetrics.processedRate }}%</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 uppercase tracking-wide">Processed</div>
          <div class="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{{ displayMetrics.processedCount }}/{{ displayMetrics.totalIssues }}</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-green-300 dark:border-green-700 p-4 text-center">
          <div class="text-2xl font-bold text-green-600 dark:text-green-400">{{ displayMetrics.mergeRate || 0 }}%</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 uppercase tracking-wide">Merge Rate</div>
          <div class="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{{ displayMetrics.mergedCount || 0 }}/{{ displayMetrics.byState.closed || 0 }} closed</div>
        </div>
      </div>

      <!-- Issue table -->
      <div class="px-6 pb-6">
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <!-- Table header bar -->
          <div class="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Issues
              <span class="text-gray-400 dark:text-gray-500 font-normal ml-1">({{ filteredIssues.length }})</span>
            </h3>
            <div class="flex items-center gap-2">
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search issues..."
                class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 w-48"
              />
              <select
                v-model="stateFilter"
                class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="all">All States</option>
                <option value="new">New</option>
                <option value="ready-to-solve">Ready to Solve</option>
                <option value="in-progress">In Progress</option>
                <option value="closed">Closed</option>
                <option value="other">Other</option>
              </select>
              <select
                v-model="processedFilter"
                class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="all">All</option>
                <option value="processed">Processed</option>
                <option value="unprocessed">Not Processed</option>
              </select>
            </div>
          </div>

          <!-- Table -->
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th class="px-4 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Key</th>
                  <th class="px-4 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Summary</th>
                  <th class="px-4 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Component</th>
                  <th class="px-4 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Status</th>
                  <th class="px-4 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Agent State</th>
                  <th class="px-4 py-2 text-center text-gray-500 dark:text-gray-400 font-medium">PR</th>
                  <th class="px-4 py-2 text-center text-gray-500 dark:text-gray-400 font-medium">Processed</th>
                  <th class="px-4 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Priority</th>
                  <th class="px-4 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Assignee</th>
                  <th class="px-4 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="filteredIssues.length === 0">
                  <td colspan="10" class="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                    No issues match your filters.
                  </td>
                </tr>
                <tr
                  v-for="issue in filteredIssues"
                  :key="issue.key"
                  class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <td class="px-4 py-2">
                    <a
                      :href="`${jiraHost}/browse/${issue.key}`"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-primary-600 dark:text-primary-400 hover:underline font-medium"
                    >
                      {{ issue.key }}
                    </a>
                  </td>
                  <td class="px-4 py-2 text-gray-900 dark:text-gray-100 max-w-md truncate">
                    {{ issue.summary }}
                  </td>
                  <td class="px-4 py-2 text-gray-600 dark:text-gray-300 text-xs">
                    {{ issue.components.join(', ') || '—' }}
                  </td>
                  <td class="px-4 py-2 text-gray-600 dark:text-gray-300">
                    {{ issue.status }}
                  </td>
                  <td class="px-4 py-2">
                    <span :class="stateClasses(issue.agentState)">
                      {{ stateLabel(issue.agentState) }}
                    </span>
                  </td>
                  <td class="px-4 py-2 text-center">
                    <a v-if="issue.prMerged && issue.prLinks && issue.prLinks.length > 0" :href="issue.prLinks[0]" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50" :title="issue.prLinks.join('\n')">
                      Merged{{ issue.prLinks.length > 1 ? ` (${issue.prLinks.length})` : '' }}
                    </a>
                    <a v-else-if="issue.prLinks && issue.prLinks.length > 0" :href="issue.prLinks[0]" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600" :title="issue.prLinks.join('\n')">
                      PR{{ issue.prLinks.length > 1 ? ` (${issue.prLinks.length})` : '' }}
                    </a>
                    <span v-else class="text-gray-300 dark:text-gray-600">—</span>
                  </td>
                  <td class="px-4 py-2 text-center">
                    <span v-if="issue.processed" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      Yes
                    </span>
                    <span v-else class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                      No
                    </span>
                  </td>
                  <td class="px-4 py-2 text-gray-600 dark:text-gray-300">
                    {{ issue.priority }}
                  </td>
                  <td class="px-4 py-2 text-gray-600 dark:text-gray-300">
                    {{ issue.assignee || '—' }}
                  </td>
                  <td class="px-4 py-2 text-gray-400 dark:text-gray-500 text-xs">
                    {{ formatDate(issue.updated) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Fetched-at footer -->
          <div v-if="agentData.fetchedAt" class="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
            Last updated: {{ formatDate(agentData.fetchedAt) }}
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import LoadingOverlay from '@shared/client/components/LoadingOverlay.vue';

const props = defineProps({
  agentData: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null }
});

defineEmits(['retry']);

const TEAMS = [
  { key: 'hypershift', label: 'HyperShift', components: ['HyperShift', 'Hosted Control Planes'] },
  { key: 'installer', label: 'Installer', components: ['Installer / openshift-installer'] },
  { key: 'trt', label: 'TRT', projectPrefix: 'TRT' },
  { key: 'edge-ecosystem', label: 'Edge & Ecosystem', components: [] },
];

const selectedTeam = ref('all');
const searchQuery = ref('');
const stateFilter = ref('all');
const processedFilter = ref('all');

const teamOptions = computed(() => [
  { key: 'all', label: 'All Teams', components: [] },
  ...TEAMS
]);

const jiraHost = computed(() => props.agentData?.jiraHost || 'https://redhat.atlassian.net');

function filterByTeam(issues, teamKey) {
  if (teamKey === 'all') return issues;
  const team = TEAMS.find(t => t.key === teamKey);
  if (!team) return issues;
  if (team.projectPrefix) {
    return issues.filter(i => i.key.startsWith(team.projectPrefix + '-'));
  }
  return issues.filter(i => i.components.some(c => team.components.includes(c)));
}

const teamFilteredIssues = computed(() => {
  if (!props.agentData?.issues) return [];
  return filterByTeam(props.agentData.issues, selectedTeam.value);
});

function teamStats(teamKey) {
  if (!props.agentData?.issues) return { total: 0, closed: 0, closedOnly: 0, merged: 0, inProgress: 0 };
  const issues = filterByTeam(props.agentData.issues, teamKey);
  let closed = 0;
  let merged = 0;
  let inProgress = 0;
  for (const i of issues) {
    if (i.agentState === 'closed') closed++;
    if (i.agentState === 'in-progress') inProgress++;
    if (i.prMerged) merged++;
  }
  return { total: issues.length, closed, merged, inProgress };
}

function recomputeMetrics(issues) {
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
  const processedRate = totalIssues > 0 ? Math.round((processedCount / totalIssues) * 100) : 0;
  const mergeRate = closedCount > 0 ? Math.round((mergedCount / closedCount) * 100) : 0;
  return { totalIssues, byState, processedCount, processedRate, mergedCount, mergeRate };
}

const displayMetrics = computed(() => {
  if (selectedTeam.value === 'all') {
    return props.agentData?.metrics || { totalIssues: 0, byState: {}, processedCount: 0, processedRate: 0 };
  }
  return recomputeMetrics(teamFilteredIssues.value);
});

const filteredIssues = computed(() => {
  let issues = teamFilteredIssues.value;

  if (stateFilter.value !== 'all') {
    issues = issues.filter(i => i.agentState === stateFilter.value);
  }

  if (processedFilter.value === 'processed') {
    issues = issues.filter(i => i.processed);
  } else if (processedFilter.value === 'unprocessed') {
    issues = issues.filter(i => !i.processed);
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    issues = issues.filter(i =>
      i.key.toLowerCase().includes(q) ||
      i.summary.toLowerCase().includes(q) ||
      (i.assignee && i.assignee.toLowerCase().includes(q)) ||
      i.components.some(c => c.toLowerCase().includes(q))
    );
  }

  return issues;
});

const STATE_LABELS = {
  'new': 'New',
  'ready-to-solve': 'Ready to Solve',
  'in-progress': 'In Progress',
  'closed': 'Closed',
  'other': 'Other'
};

const STATE_CLASSES = {
  'new': 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'ready-to-solve': 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'in-progress': 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'closed': 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  'other': 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-500'
};

function stateLabel(state) {
  return STATE_LABELS[state] || state;
}

function stateClasses(state) {
  return STATE_CLASSES[state] || STATE_CLASSES.other;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
</script>
