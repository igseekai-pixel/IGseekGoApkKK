// Client-side file parsers for chat attachments.
// Extracts readable text from PDF, DOCX, XLSX, PPTX, ZIP, etc.

export type ParseResult = {
  kind: "text" | "image" | "binary";
  content: string; // markdown-ready block
  note?: string;
};

const TEXT_EXT = new Set([
  "txt","md","markdown","rst","log","csv","tsv","json","json5","jsonl","xml","yaml","yml","toml","ini","cfg","conf","env",
  "html","htm","xhtml","css","scss","sass","less","styl",
  "js","jsx","mjs","cjs","ts","tsx","vue","svelte","astro",
  "py","rb","go","rs","java","kt","kts","scala","groovy","clj","cljs","cljc","edn",
  "c","h","cpp","cc","cxx","hpp","hh","hxx","m","mm","cs","fs","fsx","vb",
  "php","phtml","pl","pm","lua","dart","swift","r","jl","nim","zig","d","hs","elm","ex","exs","erl","hrl",
  "sh","bash","zsh","fish","ps1","bat","cmd","awk","sed",
  "sql","psql","graphql","gql","proto","thrift","prisma",
  "dockerfile","dockerignore","gitignore","gitattributes","editorconfig","npmrc","nvmrc","prettierrc","eslintrc","babelrc",
  "makefile","mk","cmake","gradle","bazel","bzl","nix","tf","tfvars","hcl","pp","srt","vtt","ass","tex","bib","rmd","patch","diff","po","pot",
]);

const IMG_EXT = new Set(["png","jpg","jpeg","gif","webp","bmp","avif","heic","heif","ico"]);

function fence(lang: string, body: string) {
  return "```" + lang + "\n" + body + "\n```";
}

function truncate(s: string, max = 200_000) {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n\n… [truncated ${s.length - max} chars]`;
}

async function parsePdf(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");
  // @ts-ignore - vite ?url import for worker
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  const max = Math.min(doc.numPages, 100);
  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => it.str).join(" ");
    parts.push(`--- Page ${i} ---\n${text}`);
  }
  if (doc.numPages > max) parts.push(`\n[… ${doc.numPages - max} more pages omitted]`);
  return parts.join("\n\n");
}

async function parseDocx(file: File): Promise<string> {
  const mammoth: any = await import("mammoth/mammoth.browser" as any);
  const buf = await file.arrayBuffer();
  const res = await mammoth.extractRawText({ arrayBuffer: buf });
  return res.value || "";
}

async function parseXlsx(file: File): Promise<string> {
  const XLSX: any = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(ws);
    parts.push(`### Sheet: ${name}\n${fence("csv", csv)}`);
  }
  return parts.join("\n\n");
}

async function parsePptx(file: File): Promise<string> {
  const JSZip: any = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)/i)?.[1] || "0");
      const nb = parseInt(b.match(/slide(\d+)/i)?.[1] || "0");
      return na - nb;
    });
  const out: string[] = [];
  for (const n of slideFiles) {
    const xml = await zip.files[n].async("string");
    const texts = Array.from(xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)).map((m: any) => m[1]);
    out.push(`--- ${n.split("/").pop()} ---\n${texts.join(" ")}`);
  }
  return out.join("\n\n");
}

async function parseZip(file: File): Promise<string> {
  const JSZip: any = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files) as any[];
  const list: string[] = [];
  const files: string[] = [];
  let inlined = 0;
  const MAX_INLINE_FILES = 25;
  const MAX_FILE_BYTES = 100_000;
  for (const e of entries) {
    if (e.dir) { list.push(`📁 ${e.name}`); continue; }
    const sz = e._data?.uncompressedSize ?? 0;
    list.push(`📄 ${e.name} (${sz} B)`);
    if (inlined >= MAX_INLINE_FILES) continue;
    const ext = (e.name.split(".").pop() || "").toLowerCase();
    if (!TEXT_EXT.has(ext)) continue;
    if (sz > MAX_FILE_BYTES) continue;
    try {
      const txt = await e.async("string");
      files.push(`### ${e.name}\n${fence(ext, truncate(txt, MAX_FILE_BYTES))}`);
      inlined++;
    } catch {}
  }
  return `**Archive contents (${entries.length} entries):**\n${list.join("\n")}\n\n${files.join("\n\n")}`;
}

export async function parseAttachment(file: File): Promise<ParseResult> {
  const name = file.name;
  const ext = (name.split(".").pop() || "").toLowerCase();
  const sizeMb = (file.size / 1024 / 1024).toFixed(2);
  const sizeKb = (file.size / 1024).toFixed(1);
  const sizeLabel = file.size > 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;
  const header = (icon: string) => `${icon} **${name}** (${sizeLabel})`;

  // Plain text / code
  if (TEXT_EXT.has(ext) || file.type.startsWith("text/") || file.type.includes("json") || file.type.includes("xml") || file.type.includes("javascript")) {
    if (file.size <= 5 * 1024 * 1024) {
      const txt = await file.text();
      return { kind: "text", content: `${header("📎")}\n${fence(ext, truncate(txt))}` };
    }
  }

  // Images → data URL for vision
  if (IMG_EXT.has(ext) || file.type.startsWith("image/")) {
    if (file.size <= 10 * 1024 * 1024) {
      const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = () => rej(r.error);
        r.readAsDataURL(file);
      });
      return { kind: "image", content: `![${name}](${dataUrl})` };
    }
  }

  // Structured documents
  try {
    if (ext === "pdf") {
      const text = await parsePdf(file);
      return { kind: "text", content: `${header("📕")}\n${fence("text", truncate(text))}` };
    }
    if (ext === "docx") {
      const text = await parseDocx(file);
      return { kind: "text", content: `${header("📘")}\n${fence("text", truncate(text))}` };
    }
    if (ext === "xlsx" || ext === "xls" || ext === "xlsm" || ext === "ods") {
      const text = await parseXlsx(file);
      return { kind: "text", content: `${header("📊")}\n${truncate(text)}` };
    }
    if (ext === "pptx") {
      const text = await parsePptx(file);
      return { kind: "text", content: `${header("📙")}\n${fence("text", truncate(text))}` };
    }
    if (ext === "zip" || ext === "jar" || ext === "apk" || ext === "docx" || ext === "xlsx" || ext === "pptx") {
      // (docx/xlsx/pptx handled above; jar/apk fall through)
    }
    if (ext === "zip" || ext === "jar" || ext === "apk") {
      const text = await parseZip(file);
      return { kind: "text", content: `${header("🗜️")}\n${truncate(text)}` };
    }
    if (ext === "ipynb") {
      const txt = await file.text();
      try {
        const nb = JSON.parse(txt);
        const parts: string[] = [];
        for (const cell of nb.cells || []) {
          const src = Array.isArray(cell.source) ? cell.source.join("") : cell.source;
          if (cell.cell_type === "code") parts.push(fence("python", src));
          else parts.push(src);
        }
        return { kind: "text", content: `${header("📓")}\n${truncate(parts.join("\n\n"))}` };
      } catch {
        return { kind: "text", content: `${header("📓")}\n${fence("json", truncate(txt))}` };
      }
    }
  } catch (err: any) {
    return {
      kind: "binary",
      content: `${header("📎")} — failed to parse: ${err?.message || String(err)}`,
    };
  }

  // Unknown binary
  return {
    kind: "binary",
    content: `${header("📎")} — attached (binary, ${file.type || "unknown type"})`,
  };
}
