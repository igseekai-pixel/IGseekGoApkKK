import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import type { TerminalExecutionResult } from "../types/flow";

const execAsync = promisify(exec);

// Allowed commands and security sandbox policies
const SANDBOX_ROOT = path.resolve("/tmp/igseek_sandbox/workspace");

const FORBIDDEN_PATTERNS = [
  /\brm\s+-rf\s+\/($|\s)/i,
  /\brm\s+-rf\s+~($|\s)/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /:(){ :\|:& };:/, // fork bomb
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bchmod\s+-R\s+777\s+\//i,
];

const ARCH_ASCII_LOGO = `
                   -\`                    arch@archlinux
                  .o+\`                   --------------
                 \`ooo/                   OS: Arch Linux x86_64
                \`+oooo:                  Host: IG Flow Sandbox Container
               \`+oooooo:                 Kernel: 6.9.3-arch1-1
               -+oooooo+:                Uptime: 1 hour, 34 mins
             \`/:-\`:++oooo+:               Packages: 842 (pacman)
            \`/++++/+++++++:              Shell: bash 5.2.26
           \`/++++++++++++++:             Terminal: igflow-pty
          \`/+++ooooooooooooo/\`           CPU: AMD EPYC (Containerized)
         ./ooosssso++osssssso+\`          Memory: 1142MiB / 8192MiB
        .oossssso-\`\`\`\`/ossssss+\`         Disk: 5.2G / 50G (/library mounted)
       -osssssso.      :ssssssso.        Locale: ru_RU.UTF-8 / en_US.UTF-8
      :osssssss/        osssso+++.       WM: IG Flow PTY
     /ossssssss/        +ssssooo/-       
   \`/ossssso+/:-        -:/+osssso+-     
  \`+sso+:-\`                 \`.-/+oso:    
 \`++:.                           \`-/+/   
 .\`                                 \`/   
`;

function sanitizeProjectId(projectId?: string | null): string | null {
  if (!projectId) return null;
  const clean = projectId.replace(/[^a-zA-Z0-9._-]/g, "_").trim();
  return clean || null;
}

export function sanitizeLibraryFilename(filename: string): string {
  const base = path.basename(filename).trim();
  const safe = base.replace(/[^a-zA-Z0-9._\-а-яА-ЯёЁ\s]/g, "_").replace(/\s+/g, "_");
  return safe || `flow_file_${Date.now()}.txt`;
}

function detectFileType(filename: string): "document" | "code" | "data" | "image" {
  const ext = path.extname(filename).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)) return "image";
  if ([".ts", ".tsx", ".js", ".jsx", ".py", ".sh", ".css", ".html", ".sql", ".go", ".rs"].includes(ext)) return "code";
  if ([".json", ".csv", ".tsv", ".yaml", ".yml", ".xml", ".ics"].includes(ext)) return "data";
  return "document";
}

function isLikelyTextFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  const binaryExts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".zip", ".gz", ".tar", ".bin", ".exe", ".mp4", ".mp3"];
  return !binaryExts.includes(ext);
}

/**
 * Returns the workspace root and library directory for either global scope or a specific project.
 */
export function getSandboxPaths(projectId?: string | null): { workspaceDir: string; libraryDir: string } {
  const safeProj = sanitizeProjectId(projectId);
  if (safeProj) {
    const workspaceDir = path.join(SANDBOX_ROOT, "projects", safeProj);
    const libraryDir = path.join(workspaceDir, "library");
    return { workspaceDir, libraryDir };
  }
  return {
    workspaceDir: SANDBOX_ROOT,
    libraryDir: path.join(SANDBOX_ROOT, "library"),
  };
}

/**
 * Initializes the sandbox workspace and library directory cleanly without creating fake stub files.
 */
export async function initLibraryDirectory(projectId?: string | null): Promise<string> {
  const { workspaceDir, libraryDir } = getSandboxPaths(projectId);
  try {
    await fs.mkdir(SANDBOX_ROOT, { recursive: true });
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(libraryDir, { recursive: true });
  } catch (e) {
    console.warn("Failed to init library directory:", e);
  }
  return libraryDir;
}

export interface DiskLibraryEntry {
  name: string;
  type: "document" | "code" | "data" | "image";
  sizeBytes: number;
  updatedAt: string;
  isText: boolean;
  content?: string;
  projectId: string | null;
}

/**
 * Lists files genuinely present inside the sandbox Library directory.
 */
export async function listLibraryFilesOnDisk(
  projectId?: string | null,
  includeContent = false
): Promise<DiskLibraryEntry[]> {
  const libDir = await initLibraryDirectory(projectId);
  const cleanProj = sanitizeProjectId(projectId);
  try {
    const entries = await fs.readdir(libDir, { withFileTypes: true });
    const results: DiskLibraryEntry[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(libDir, entry.name);
      try {
        const stat = await fs.stat(fullPath);
        const isText = isLikelyTextFile(entry.name);
        let content: string | undefined;
        if (includeContent && isText && stat.size <= 512 * 1024) {
          content = await fs.readFile(fullPath, "utf8");
        }
        results.push({
          name: entry.name,
          type: detectFileType(entry.name),
          sizeBytes: stat.size,
          updatedAt: stat.mtime.toISOString(),
          isText,
          content,
          projectId: cleanProj,
        });
      } catch {
        // skip unreadable
      }
    }
    results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return results;
  } catch {
    return [];
  }
}

/**
 * Reads and verifies a specific file inside the sandbox Library directory.
 */
export async function readLibraryFileOnDisk(
  filename: string,
  projectId?: string | null
): Promise<{ name: string; content: string; sizeBytes: number; updatedAt: string } | null> {
  const libDir = await initLibraryDirectory(projectId);
  const targetExact = path.resolve(libDir, path.basename(filename));
  const candidates = [targetExact, path.resolve(libDir, sanitizeLibraryFilename(filename))];

  for (const candidate of candidates) {
    if (!candidate.startsWith(libDir)) continue;
    try {
      const stat = await fs.stat(candidate);
      if (!stat.isFile()) continue;
      const content = isLikelyTextFile(candidate)
        ? await fs.readFile(candidate, "utf8")
        : `[Binary file, ${stat.size} bytes]`;
      return {
        name: path.basename(candidate),
        content,
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
      };
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Writes a file into the sandbox Library directory and immediately verifies it on disk.
 */
export async function writeLibraryFileOnDisk(
  filename: string,
  content: string,
  projectId?: string | null
): Promise<{ name: string; path: string; sizeBytes: number; content: string }> {
  const libDir = await initLibraryDirectory(projectId);
  const safeName = sanitizeLibraryFilename(filename);
  const targetPath = path.join(libDir, safeName);

  await fs.writeFile(targetPath, content, "utf8");
  const verifiedContent = await fs.readFile(targetPath, "utf8");
  const stat = await fs.stat(targetPath);

  return {
    name: safeName,
    path: targetPath,
    sizeBytes: stat.size,
    content: verifiedContent,
  };
}

/**
 * Deletes a file from the sandbox Library directory.
 */
export async function deleteLibraryFileOnDisk(filename: string, projectId?: string | null): Promise<boolean> {
  const libDir = await initLibraryDirectory(projectId);
  const candidates = [
    path.resolve(libDir, path.basename(filename)),
    path.resolve(libDir, sanitizeLibraryFilename(filename)),
  ];
  for (const candidate of candidates) {
    if (!candidate.startsWith(libDir)) continue;
    try {
      await fs.unlink(candidate);
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

/**
 * Renames a file inside the sandbox Library directory.
 */
export async function renameLibraryFileOnDisk(
  oldName: string,
  newName: string,
  projectId?: string | null
): Promise<boolean> {
  const libDir = await initLibraryDirectory(projectId);
  const safeNew = sanitizeLibraryFilename(newName);
  const newPath = path.resolve(libDir, safeNew);
  if (!newPath.startsWith(libDir)) return false;

  const candidates = [
    path.resolve(libDir, path.basename(oldName)),
    path.resolve(libDir, sanitizeLibraryFilename(oldName)),
  ];
  for (const oldPath of candidates) {
    if (!oldPath.startsWith(libDir)) continue;
    try {
      await fs.access(oldPath);
      await fs.rename(oldPath, newPath);
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

/**
 * Syncs in-memory library files from frontend to the real ./library folder on disk.
 */
export async function syncLibraryFilesToDisk(
  files: Array<{ name: string; dataUrl?: string; content?: string }>,
  projectId?: string | null
): Promise<number> {
  const libDir = await initLibraryDirectory(projectId);
  let count = 0;

  for (const file of files) {
    if (!file || !file.name) continue;
    const safeName = sanitizeLibraryFilename(file.name);
    if (!safeName) continue;
    const targetPath = path.join(libDir, safeName);

    try {
      if (file.content !== undefined) {
        await fs.writeFile(targetPath, file.content, "utf8");
        count++;
      } else if (file.dataUrl) {
        if (file.dataUrl.startsWith("data:text/") || file.dataUrl.startsWith("data:application/json")) {
          const base64Index = file.dataUrl.indexOf(";base64,");
          if (base64Index !== -1) {
            const buf = Buffer.from(file.dataUrl.slice(base64Index + 8), "base64");
            await fs.writeFile(targetPath, buf);
          } else {
            const commaIndex = file.dataUrl.indexOf(",");
            const text = decodeURIComponent(file.dataUrl.slice(commaIndex + 1));
            await fs.writeFile(targetPath, text, "utf8");
          }
          count++;
        } else if (file.dataUrl.includes(";base64,")) {
          const parts = file.dataUrl.split(";base64,");
          if (parts[1]) {
            const buf = Buffer.from(parts[1], "base64");
            await fs.writeFile(targetPath, buf);
            count++;
          }
        }
      }
    } catch (e) {
      console.warn(`Failed to sync file ${file.name}:`, e);
    }
  }
  return count;
}

async function snapshotLibMtimes(libDir: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const entries = await fs.readdir(libDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      try {
        const st = await fs.stat(path.join(libDir, e.name));
        map.set(e.name, st.mtimeMs);
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return map;
}

/**
 * Executes a terminal command with Arch Linux personality and real Linux execution.
 */
export async function executeTerminalCommand(
  rawCommand: string,
  options: { cwd?: string; timeoutMs?: number; env?: Record<string, string>; projectId?: string | null } = {}
): Promise<TerminalExecutionResult> {
  const start = Date.now();
  const command = rawCommand.trim();

  // Ensure workspace and library dirs exist for active project/global scope
  const { workspaceDir, libraryDir } = getSandboxPaths(options.projectId);
  await initLibraryDirectory(options.projectId);

  // 1. Sandbox security guard check: prevent platform source and system secrets inspection
  const platformEscape = /\/app\b|\/proc\b|\/sys\b|\/etc\/shadow|\.\.\/\.\./i.test(command);
  if (platformEscape) {
    return {
      command,
      exitCode: 126,
      stdout: "",
      stderr: "Access restricted by Sandbox security policy: Flow agent is isolated in the user workspace and cannot access platform source code.",
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(command)) {
      return {
        command,
        exitCode: 126,
        stdout: "",
        stderr: `Security policy violation: command matched forbidden pattern [${pattern.toString()}]. Execution blocked.`,
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };
    }
  }

  let currentRunDir = workspaceDir;
  if (options.cwd) {
    const candidate = path.resolve(workspaceDir, options.cwd);
    if (candidate.startsWith(workspaceDir)) {
      try {
        const stat = await fs.stat(candidate);
        if (stat.isDirectory()) {
          currentRunDir = candidate;
        }
      } catch {
        currentRunDir = workspaceDir;
      }
    }
  }

  // 2. Arch Linux emulation intercepts
  const lower = command.toLowerCase();

  if (lower === "neofetch" || lower === "fastfetch") {
    return {
      command,
      exitCode: 0,
      stdout: ARCH_ASCII_LOGO,
      stderr: "",
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }

  if (lower === "uname -a" || lower === "uname -srm" || lower === "uname -r") {
    const out =
      lower === "uname -r"
        ? "6.9.3-arch1-1"
        : lower === "uname -srm"
        ? "Linux 6.9.3-arch1-1 x86_64"
        : "Linux archlinux 6.9.3-arch1-1 #1 SMP PREEMPT_DYNAMIC Sun, 02 Jun 2024 14:02:18 +0000 x86_64 GNU/Linux";
    return {
      command,
      exitCode: 0,
      stdout: out,
      stderr: "",
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }

  if (lower.includes("os-release") || lower.includes("arch-release") || lower.includes("cat /etc/issue")) {
    return {
      command,
      exitCode: 0,
      stdout: `NAME="Arch Linux"
PRETTY_NAME="Arch Linux"
ID=arch
BUILD_ID=rolling
ANSI_COLOR="38;2;23;147;209"
HOME_URL="https://archlinux.org/"`,
      stderr: "",
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }

  if (lower.startsWith("pacman")) {
    if (lower === "pacman" || lower === "pacman -h" || lower === "pacman --help") {
      return {
        command,
        exitCode: 0,
        stdout: `usage:  pacman <operation> [...]`,
        stderr: "",
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };
    }
    if (lower.startsWith("pacman -q")) {
      return {
        command,
        exitCode: 0,
        stdout: `bash 5.2.026-2\ncoreutils 9.5-1\ncurl 8.8.0-1\ngit 2.45.2-1\nnodejs 22.14.0-1\npython 3.12.3-1`,
        stderr: "",
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };
    }
  }

  // 3. Handling CD command
  const cdMatch = command.match(/^cd(?:\s+(.*))?$/);
  if (cdMatch) {
    const rawDest = (cdMatch[1] || "").trim();
    let destDir = workspaceDir;
    if (rawDest && rawDest !== "~") {
      destDir = path.resolve(currentRunDir, rawDest);
    }
    if (!destDir.startsWith(workspaceDir)) {
      destDir = workspaceDir;
    }

    try {
      const stat = await fs.stat(destDir);
      if (!stat.isDirectory()) {
        return {
          command,
          exitCode: 1,
          stdout: "",
          stderr: `bash: cd: ${rawDest}: Not a directory`,
          executedAt: new Date().toISOString(),
          durationMs: Date.now() - start,
        };
      }
      const rel = path.relative(workspaceDir, destDir);
      return {
        command,
        exitCode: 0,
        stdout: "",
        stderr: "",
        newCwd: rel ? rel : "~",
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };
    } catch {
      return {
        command,
        exitCode: 1,
        stdout: "",
        stderr: `bash: cd: ${rawDest}: No such file or directory`,
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };
    }
  }

  // 4. Snapshot library directory before running bash command
  const beforeSnap = await snapshotLibMtimes(libraryDir);

  // Real Linux Bash Command Execution: strict timeout and stdin redirected from /dev/null
  const timeout = Math.min(options.timeoutMs || 12000, 20000);
  const wrappedCommand = `( ${command} ) < /dev/null\necho "__FLOW_PWD__"$(pwd)`;

  try {
    const { stdout, stderr } = await execAsync(wrappedCommand, {
      cwd: currentRunDir,
      timeout,
      killSignal: "SIGKILL",
      maxBuffer: 5 * 1024 * 1024,
      env: {
        ...process.env,
        PAGER: "cat",
        CI: "true",
        USER: "arch",
        HOME: workspaceDir,
        FLOW_LIBRARY_DIR: libraryDir,
        ...options.env,
      },
      shell: "/bin/bash",
    });

    let cleanStdout = stdout || "";
    let detectedNewCwd: string | undefined = undefined;

    const pwdMarkerIndex = cleanStdout.indexOf("__FLOW_PWD__");
    if (pwdMarkerIndex !== -1) {
      const pwdLine = cleanStdout.slice(pwdMarkerIndex + 12).trim();
      cleanStdout = cleanStdout.slice(0, pwdMarkerIndex);
      if (pwdLine.startsWith(workspaceDir)) {
        const rel = path.relative(workspaceDir, pwdLine);
        detectedNewCwd = rel ? rel : "~";
      }
    }

    if (cleanStdout.endsWith("\n")) {
      cleanStdout = cleanStdout.slice(0, -1);
    }

    // Detect files created or modified inside ./library
    const afterSnap = await snapshotLibMtimes(libraryDir);
    const createdFiles: Array<{ name: string; type: string; content: string; projectId?: string | null }> = [];
    const cleanProj = sanitizeProjectId(options.projectId);

    for (const [fname, mtime] of afterSnap.entries()) {
      const prevMtime = beforeSnap.get(fname);
      if (prevMtime === undefined || mtime > prevMtime) {
        if (!isLikelyTextFile(fname)) continue;
        try {
          const full = path.join(libraryDir, fname);
          const st = await fs.stat(full);
          if (st.size <= 512 * 1024) {
            const content = await fs.readFile(full, "utf8");
            createdFiles.push({
              name: fname,
              type: detectFileType(fname),
              content,
              projectId: cleanProj,
            });
          }
        } catch { /* ignore */ }
      }
    }

    return {
      command,
      exitCode: 0,
      stdout: cleanStdout,
      stderr: stderr ? stderr.trim() : "",
      newCwd: detectedNewCwd,
      createdFiles: createdFiles.length > 0 ? createdFiles : undefined,
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    const exitCode = typeof error.code === "number" ? error.code : 1;
    let stdout = error.stdout ? String(error.stdout) : "";
    const stderr = error.stderr ? String(error.stderr).trim() : error.message || "Command failed";

    const pwdMarkerIndex = stdout.indexOf("__FLOW_PWD__");
    if (pwdMarkerIndex !== -1) {
      stdout = stdout.slice(0, pwdMarkerIndex);
    }

    return {
      command,
      exitCode,
      stdout: stdout.trim(),
      stderr,
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }
}
