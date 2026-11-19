export type FlowAutonomyLevel = "assist" | "semi-auto" | "autopilot";

export type FlowTaskStatus =
  | "idle"
  | "planning"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "paused";

export type FlowStepStatus = "pending" | "running" | "waiting_approval" | "completed" | "failed" | "skipped";

export interface FlowLibraryArtifact {
  id?: string;
  name: string;
  type: string;
  content?: string;
  url?: string;
  projectId?: string | null;
  taskId?: string;
  taskTitle?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FlowStep {
  id: string;
  title: string;
  description?: string;
  tool: string;
  toolParams?: Record<string, any>;
  status: FlowStepStatus;
  output?: string;
  error?: string;
  durationMs?: number;
  requiresApproval?: boolean;
}

export interface FlowLogEntry {
  id: string;
  timestamp: string;
  type: "info" | "action" | "approval" | "terminal" | "success" | "error";
  message: string;
  meta?: any;
}

export interface FlowMonitorConfig {
  targetUrl: string;
  conditionDescription: string;
  checkIntervalMinutes: number;
  lastCheckedAt?: string;
  lastStatus?: "matched" | "unmatched" | "error";
  alertChannel: "in_app" | "email" | "both";
  active: boolean;
}

export interface FlowTask {
  id: string;
  userId: string;
  title: string;
  goal: string;
  status: FlowTaskStatus;
  autonomy: FlowAutonomyLevel;
  steps: FlowStep[];
  logs: FlowLogEntry[];
  monitor?: FlowMonitorConfig;
  outputSummary?: string;
  outputArtifacts?: FlowLibraryArtifact[];
  createdAt: string;
  updatedAt: string;
  projectId?: string | null;
}

export interface FlowScenario {
  id: string;
  userId: string;
  name: string;
  description: string;
  category: "research" | "dev" | "monitor" | "content" | "automation";
  goalTemplate: string;
  recommendedAutonomy: FlowAutonomyLevel;
  iconName: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FlowIntegration {
  id: string;
  name: string;
  description: string;
  connected: boolean;
  accountEmail?: string;
  accountUsername?: string;
  avatarUrl?: string;
  lastSyncAt?: string;
  scopes: Array<{
    id: string;
    label: string;
    granted: boolean;
    critical?: boolean;
  }>;
}

export interface TerminalExecutionResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  executedAt: string;
  durationMs: number;
  newCwd?: string;
  createdFiles?: Array<{ name: string; type: string; content: string; projectId?: string | null }>;
}
