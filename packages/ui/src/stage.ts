export type ExecutionStage =
  | 'idle'
  | 'thinking'
  | 'analyzing_repo'
  | 'reading_files'
  | 'planning_changes'
  | 'editing_code'
  | 'running_tests'
  | 'applying_patch'
  | 'generating_response'
  | 'searching_code'
  | 'running_command'
  | 'fetching_web'
  | 'completed'
  | 'error';

const STAGE_LABELS: Record<ExecutionStage, string> = {
  idle: 'Idle',
  thinking: 'Thinking',
  analyzing_repo: 'Analyzing repository',
  reading_files: 'Reading files',
  planning_changes: 'Planning changes',
  editing_code: 'Editing code',
  running_tests: 'Running tests',
  applying_patch: 'Applying patch',
  generating_response: 'Generating response',
  searching_code: 'Searching code',
  running_command: 'Running command',
  fetching_web: 'Fetching web content',
  completed: 'Completed',
  error: 'Error',
};

const STAGE_ICONS: Record<ExecutionStage, string> = {
  idle: '○',
  thinking: '◉',
  analyzing_repo: '◎',
  reading_files: '◎',
  planning_changes: '◎',
  editing_code: '✎',
  running_tests: '⚙',
  applying_patch: '◆',
  generating_response: '◉',
  searching_code: '◎',
  running_command: '❯',
  fetching_web: '◎',
  completed: '✓',
  error: '✗',
};

export function getStageLabel(stage: ExecutionStage): string {
  return STAGE_LABELS[stage];
}

export function getStageIcon(stage: ExecutionStage, useUnicode: boolean): string {
  if (!useUnicode) {
    switch (stage) {
      case 'idle': return 'o';
      case 'thinking': return '*';
      case 'completed': return '+';
      case 'error': return 'x';
      default: return '*';
    }
  }
  return STAGE_ICONS[stage];
}

export function inferStageFromTool(toolName: string): ExecutionStage {
  switch (toolName) {
    case 'read_file':
      return 'reading_files';
    case 'write_file':
    case 'edit_file':
    case 'undo_edit':
      return 'editing_code';
    case 'run_command':
      return 'running_command';
    case 'search_code':
      return 'searching_code';
    case 'web_fetch':
      return 'fetching_web';
    case 'git':
      return 'applying_patch';
    default:
      return 'thinking';
  }
}
