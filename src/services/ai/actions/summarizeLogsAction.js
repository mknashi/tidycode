/**
 * Summarize Logs Action
 *
 * Analyzes log files to extract key insights, errors, and patterns.
 */

import { providerManager } from '../ProviderManager.js';
import { ActionResult } from './ActionManager.js';

/**
 * Log analysis types
 */
export const ANALYSIS_TYPES = {
  general: {
    name: 'General Summary',
    description: 'Overall summary with key events and patterns',
    instruction: `Provide a comprehensive summary including:
- Time range covered (if timestamps are present)
- Key events and their frequency
- Errors or warnings (with counts)
- Notable patterns or anomalies
- System health indicators
- Recommendations if applicable`,
  },
  errors: {
    name: 'Error Analysis',
    description: 'Focus on errors and their root causes',
    instruction: `Focus on error analysis:
- List all unique errors with occurrence counts
- Identify error patterns and potential root causes
- Highlight critical vs non-critical issues
- Group related errors together
- Suggest investigation priorities
- Identify any error cascades or chains`,
  },
  performance: {
    name: 'Performance Analysis',
    description: 'Analyze performance indicators',
    instruction: `Analyze performance indicators:
- Response times and latencies (if present)
- Throughput patterns
- Resource utilization hints
- Bottleneck indicators
- Performance degradation patterns
- Slow queries or operations
- Memory or CPU issues`,
  },
  security: {
    name: 'Security Analysis',
    description: 'Security-focused log analysis',
    instruction: `Security-focused analysis:
- Authentication/authorization events
- Failed login attempts and patterns
- Suspicious patterns or anomalies
- IP addresses or users of interest
- Access to sensitive resources
- Potential security concerns
- Compliance-relevant events`,
  },
  timeline: {
    name: 'Timeline',
    description: 'Chronological event timeline',
    instruction: `Create a chronological timeline:
- Major events in order
- State changes
- Error occurrences with timestamps
- Recovery events
- Key milestones
- Duration between significant events`,
  },
};

/**
 * Build prompt for log summarization
 * @param {string} content - Log content
 * @param {string} analysisType - Type of analysis
 * @returns {string}
 */
function buildSummarizePrompt(content, analysisType) {
  const typeConfig = ANALYSIS_TYPES[analysisType] || ANALYSIS_TYPES.general;

  return `Analyze the following log content and ${typeConfig.instruction}

Format your response in clear markdown with:
- Sections and headers
- Bullet points for lists
- Code blocks for specific log entries
- Tables where appropriate for counts/statistics

Log content:
\`\`\`
${content}
\`\`\`

Provide a clear, actionable analysis.`;
}

/**
 * Summarize logs action handler
 * @param {import('./ActionManager.js').ActionContext} context - Action context
 * @param {Object} options - Action options
 * @param {string} [options.type='general'] - Analysis type
 * @param {number} [options.maxLines] - Max lines to analyze (for truncation)
 * @returns {Promise<ActionResult>}
 */
export async function summarizeLogsAction(context, options = {}) {
  const content = context.getText();

  if (!content || content.trim().length === 0) {
    return ActionResult.failure('summarize-logs', 'No log content to analyze');
  }

  const { type = 'general', maxLines } = options;

  if (!ANALYSIS_TYPES[type]) {
    return ActionResult.failure('summarize-logs', `Unknown analysis type: ${type}`);
  }

  // Optionally truncate very long logs
  let logContent = content;
  let truncated = false;
  if (maxLines) {
    const lines = content.split('\n');
    if (lines.length > maxLines) {
      logContent = lines.slice(0, maxLines).join('\n');
      truncated = true;
    }
  }

  const prompt = buildSummarizePrompt(logContent, type);

  try {
    const result = await providerManager.complete({
      prompt,
      language: 'markdown',
      task: 'summarize-logs',
      options: {
        maxTokens: 2048,
        temperature: 0.3,
      },
    });

    const summary = result.text;

    // Extract some basic stats
    const lineCount = content.split('\n').length;
    const errorCount = (content.match(/\b(error|err|exception|fail|fatal)\b/gi) || []).length;
    const warningCount = (content.match(/\b(warn|warning)\b/gi) || []).length;

    return ActionResult.success('summarize-logs', summary, {
      analysisType: type,
      analysisTypeName: ANALYSIS_TYPES[type].name,
      lineCount,
      errorCount,
      warningCount,
      truncated,
      usage: result.usage,
    });
  } catch (error) {
    return ActionResult.failure('summarize-logs', error.message);
  }
}

/**
 * Stream summarize logs action
 * @param {import('./ActionManager.js').ActionContext} context - Action context
 * @param {Function} onChunk - Callback for each chunk
 * @param {Object} options - Action options
 * @returns {Promise<ActionResult>}
 */
export async function summarizeLogsActionStream(context, onChunk, options = {}) {
  const content = context.getText();

  if (!content || content.trim().length === 0) {
    return ActionResult.failure('summarize-logs', 'No log content to analyze');
  }

  const { type = 'general' } = options;
  const prompt = buildSummarizePrompt(content, type);

  try {
    const result = await providerManager.streamComplete(
      {
        prompt,
        language: 'markdown',
        task: 'summarize-logs',
        options: {
          maxTokens: 2048,
          temperature: 0.3,
        },
      },
      onChunk
    );

    return ActionResult.success('summarize-logs', result.text, {
      analysisType: type,
      streamed: true,
    });
  } catch (error) {
    return ActionResult.failure('summarize-logs', error.message);
  }
}

/**
 * Get available analysis types
 * @returns {Array<Object>}
 */
export function getAnalysisTypes() {
  return Object.entries(ANALYSIS_TYPES).map(([id, config]) => ({
    id,
    name: config.name,
    description: config.description,
  }));
}

export default summarizeLogsAction;
