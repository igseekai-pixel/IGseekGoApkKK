import { z } from "zod";
import {
  executeTerminalCommand,
  syncLibraryFilesToDisk,
  listLibraryFilesOnDisk,
  deleteLibraryFileOnDisk,
  renameLibraryFileOnDisk,
} from "../../lib/flow-terminal";
import { planFlowTask, executeFlowStep } from "../../lib/flow-engine";
import { getUserFromToken } from "../../lib/memory-server";

function bearer(request: Request) {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7) : "";
}

const PlanSchema = z.object({
  action: z.literal("plan"),
  goal: z.string().min(3).max(4000),
  autonomy: z.enum(["assist", "semi-auto", "autopilot"]).default("semi-auto"),
  agent: z.enum(["universal", "coder", "hacker", "mentor", "psy", "creative"]).optional().default("universal"),
  model: z.enum(["instinct", "chat", "f1"]).optional().default("instinct"),
  projectId: z.string().nullable().optional(),
  availableFiles: z
    .array(
      z.object({
        name: z.string(),
        type: z.string().optional(),
      })
    )
    .optional(),
  hasGithub: z.boolean().optional(),
  hasGmail: z.boolean().optional(),
  hasCalendar: z.boolean().optional(),
});

const RunStepSchema = z
  .object({
    action: z.literal("run_step"),
    step: z
      .object({
        id: z.string().optional().default("step_1"),
        title: z.string().optional().default("Step"),
        description: z.string().optional().default(""),
        tool: z.string().optional().default("terminal"),
        toolParams: z.record(z.string(), z.any()).optional().default({}),
        status: z.string().optional().default("pending"),
        requiresApproval: z.boolean().optional().default(false),
      })
      .passthrough(),
    taskContext: z
      .object({
        goal: z.string().optional().default("Autonomous task"),
        autonomy: z.string().optional().default("semi-auto"),
        agent: z.enum(["universal", "coder", "hacker", "mentor", "psy", "creative"]).optional().default("universal"),
        model: z.enum(["instinct", "chat", "f1"]).optional().default("instinct"),
        projectId: z.string().nullable().optional(),
        previousSteps: z
          .array(
            z.object({
              title: z.string(),
              tool: z.string(),
              status: z.string(),
              output: z.string().optional(),
            })
          )
          .optional(),
        availableFiles: z
          .array(
            z.object({
              name: z.string(),
              type: z.string().optional(),
              snippet: z.string().optional(),
            })
          )
          .optional(),
        githubToken: z.string().optional(),
        gmailToken: z.string().optional(),
        calendarToken: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

const TerminalSchema = z.object({
  action: z.literal("terminal"),
  command: z.string().min(1).max(2000),
  cwd: z.string().optional(),
  projectId: z.string().nullable().optional(),
});

const SyncLibrarySchema = z.object({
  action: z.literal("sync_library"),
  projectId: z.string().nullable().optional(),
  files: z.array(
    z.object({
      name: z.string(),
      dataUrl: z.string().optional(),
      content: z.string().optional(),
    })
  ),
});

const ListLibrarySchema = z.object({
  action: z.literal("list_library"),
  projectId: z.string().nullable().optional(),
  includeContent: z.boolean().optional().default(true),
});

const DeleteLibraryFileSchema = z.object({
  action: z.literal("delete_library_file"),
  name: z.string().min(1),
  projectId: z.string().nullable().optional(),
});

const RenameLibraryFileSchema = z.object({
  action: z.literal("rename_library_file"),
  oldName: z.string().min(1),
  newName: z.string().min(1),
  projectId: z.string().nullable().optional(),
});

export async function handleFlowRequest(request: Request): Promise<Response> {
  const token = bearer(request);
  const authed = token ? await getUserFromToken(token) : null;
  const _isGuest = request.headers.get("x-guest-mode") !== "false" || !authed;

  if (request.method === "POST") {
    try {
      const body = await request.json();

      if (body.action === "terminal") {
        const parsed = TerminalSchema.parse(body);
        const result = await executeTerminalCommand(parsed.command, {
          cwd: parsed.cwd,
          projectId: parsed.projectId,
        });
        return new Response(JSON.stringify({ result }), {
          headers: { "content-type": "application/json" },
        });
      }

      if (body.action === "plan") {
        const parsed = PlanSchema.parse(body);
        const plan = await planFlowTask(parsed.goal, parsed.autonomy, {
          projectId: parsed.projectId,
          availableFiles: parsed.availableFiles,
          hasGithub: parsed.hasGithub,
          hasGmail: parsed.hasGmail,
          hasCalendar: parsed.hasCalendar,
          agent: parsed.agent,
          model: parsed.model,
        });
        return new Response(JSON.stringify({ plan }), {
          headers: { "content-type": "application/json" },
        });
      }

      if (body.action === "run_step") {
        const parsed = RunStepSchema.parse(body);
        const res = await executeFlowStep(parsed.step as any, parsed.taskContext as any);
        return new Response(JSON.stringify({ stepResult: res }), {
          headers: { "content-type": "application/json" },
        });
      }

      if (body.action === "sync_library") {
        const parsed = SyncLibrarySchema.parse(body);
        const count = await syncLibraryFilesToDisk(parsed.files, parsed.projectId);
        const diskFiles = await listLibraryFilesOnDisk(parsed.projectId, false);
        return new Response(JSON.stringify({ ok: true, synced: count, diskFiles }), {
          headers: { "content-type": "application/json" },
        });
      }

      if (body.action === "list_library") {
        const parsed = ListLibrarySchema.parse(body);
        const files = await listLibraryFilesOnDisk(parsed.projectId, parsed.includeContent);
        return new Response(JSON.stringify({ ok: true, files }), {
          headers: { "content-type": "application/json" },
        });
      }

      if (body.action === "delete_library_file") {
        const parsed = DeleteLibraryFileSchema.parse(body);
        const deleted = await deleteLibraryFileOnDisk(parsed.name, parsed.projectId);
        return new Response(JSON.stringify({ ok: deleted }), {
          headers: { "content-type": "application/json" },
        });
      }

      if (body.action === "rename_library_file") {
        const parsed = RenameLibraryFileSchema.parse(body);
        const renamed = await renameLibraryFileOnDisk(parsed.oldName, parsed.newName, parsed.projectId);
        return new Response(JSON.stringify({ ok: renamed }), {
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    } catch (err: any) {
      console.error("Flow API error:", err);
      return new Response(JSON.stringify({ error: err.message || "Flow request failed" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
}
