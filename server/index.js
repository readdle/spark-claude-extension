#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

process.on("uncaughtException", (err) => {
  console.error(`[spark-mcp] uncaught exception: ${err.message}`);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error(`[spark-mcp] unhandled rejection: ${err}`);
  process.exit(1);
});

const execFileAsync = promisify(execFile);

// Use the absolute path: GUI apps on macOS inherit a minimal PATH that
// does not include /usr/local/bin, where Spark CLI Setup installs the
// `spark` symlink, so resolving by name would fail under Claude Desktop.
const SPARK_PATH = process.env.SPARK_PATH || "/usr/local/bin/spark";
const EXEC_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

// Hard cap on per-attachment file size returned through MCP content blocks.
// Bytes are loaded fully into memory and base64-encoded over stdio - anything
// larger than this is rejected with a clear error instead of risking the
// server's memory budget. Override with the SPARK_ATTACHMENT_MAX_BYTES env var.
const ATTACHMENT_MAX_BYTES =
  Number(process.env.SPARK_ATTACHMENT_MAX_BYTES) || 50 * 1024 * 1024;

// Treated as plain text (utf8) in addition to anything with a text/* MIME.
const TEXT_LIKE_MIMES = new Set([
  "application/json",
  "application/xml",
  "application/x-ndjson",
  "application/javascript",
  "application/ecmascript",
]);

// Required by the Claude Connectors Directory: every tool must carry
// either `readOnlyHint: true` or `destructiveHint: true`. The spark CLI
// catalog may include `annotations` per tool; this static map is the
// fallback for known tools and the safe default for any future write
// tool the CLI may add.
const READ_ONLY_TOOLS = new Set([
  "accounts",
  "folders",
  "emails",
  "search",
  "thread",
  "attachment",
  "events",
  "availability",
  "contacts",
  "team",
  "meetings",
  "meeting",
  "templates",
  "template",
]);

function defaultAnnotationsFor(toolName) {
  return READ_ONLY_TOOLS.has(toolName)
    ? { readOnlyHint: true }
    : { destructiveHint: true };
}

function humanizeToolName(name) {
  return name
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function humanSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return `${bytes} B`;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

console.error(`[spark-mcp] using spark at: ${SPARK_PATH}`);

let catalog = null;
let toolMap = null;
let catalogError = null;
let catalogPromise = null;

async function ensureCatalog() {
  if (catalog) return;
  if (catalogError) throw catalogError;
  if (catalogPromise) return catalogPromise;

  catalogPromise = loadCatalogOnce();
  return catalogPromise;
}

async function checkSparkVersion() {
  try {
    const { stdout } = await execFileAsync(
      SPARK_PATH,
      ["--version"],
      { timeout: 5_000 },
    );
    const actual = stdout.trim();
    if (actual !== EXPECTED_SPARK_VERSION) {
      console.error(
        `[spark-mcp] WARNING: spark version mismatch - expected ${EXPECTED_SPARK_VERSION}, got ${actual}. Tools may not work correctly.`,
      );
    } else {
      console.error(`[spark-mcp] spark version ${actual}`);
    }
  } catch (err) {
    console.error(
      `[spark-mcp] WARNING: could not check spark version: ${err.message}`,
    );
  }
}

async function loadCatalogOnce() {
  try {
    console.error("[spark-mcp] loading tool catalog...");
    await checkSparkVersion();
    const { stdout, stderr } = await execFileAsync(
      SPARK_PATH,
      ["tools"],
      { timeout: 10_000 },
    );
    if (stderr) console.error(`[spark-mcp] spark stderr: ${stderr.trim()}`);
    catalog = JSON.parse(stdout);
    toolMap = new Map();
    for (const tool of catalog.tools) {
      toolMap.set(tool.name, tool);
    }
    console.error(
      `[spark-mcp] loaded ${catalog.tools.length} tools from spark`,
    );
  } catch (err) {
    const detail =
      err.code === "ENOENT"
        ? `'${SPARK_PATH}' not found. Install Spark Desktop and enable the Spark CLI (Settings → AI Agents → Spark CLI Setup), or set SPARK_PATH to the spark binary.`
        : err.stderr?.trim() || err.message;
    catalogError = new Error(
      `Cannot load spark tools: ${detail}`,
    );
    console.error(`[spark-mcp] ${catalogError.message}`);
    throw catalogError;
  }
}

function buildInputSchema(parameters) {
  const properties = {};
  const required = [];

  for (const param of parameters) {
    const prop = { description: param.description };

    if (param.type === "array") {
      prop.type = "array";
      if (param.items) {
        prop.items = { type: param.items.type };
      }
    } else {
      prop.type = param.type;
    }

    properties[param.name] = prop;
    if (param.required) {
      required.push(param.name);
    }
  }

  const schema = { type: "object", properties };
  if (required.length > 0) {
    schema.required = required;
  }
  return schema;
}

function buildCliArgs(toolDef, input) {
  const positional = [];
  const flagged = [];

  for (const param of toolDef.parameters) {
    const value = input[param.name];
    if (value === undefined || value === null) continue;

    if (!param.flag) {
      if (Array.isArray(value)) {
        positional.push(...value.map(String));
      } else {
        positional.push(String(value));
      }
    } else if (param.type === "boolean") {
      if (value) flagged.push(param.flag);
    } else if (param.type === "array") {
      for (const v of value) {
        flagged.push(param.flag, String(v));
      }
    } else {
      flagged.push(param.flag, String(value));
    }
  }

  return [...positional, ...flagged];
}

const EXPECTED_SPARK_VERSION = "1.2.1";

// Load the catalog eagerly so the `initialize` handshake can forward the
// Spark skill to Claude as the server's `instructions` field. If the
// catalog cannot be loaded (Spark Desktop offline, spark missing, etc.)
// we still start the server so tool calls can report a useful error later.
let initialInstructions = "";
try {
  await ensureCatalog();
  initialInstructions = catalog.instructions || "";
} catch (err) {
  console.error(
    `[spark-mcp] could not preload tool catalog, starting without instructions: ${err.message}`,
  );
}

const server = new Server(
  { name: "spark", version: EXPECTED_SPARK_VERSION },
  {
    capabilities: { tools: {} },
    instructions: initialInstructions,
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  await ensureCatalog();
  return {
    tools: catalog.tools.map((tool) => {
      const annotations = {
        title: tool.title || humanizeToolName(tool.name),
        ...defaultAnnotationsFor(tool.name),
        ...(tool.annotations || {}),
      };
      return {
        name: tool.name,
        title: annotations.title,
        description: tool.description,
        inputSchema: buildInputSchema(tool.parameters),
        annotations,
      };
    }),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    await ensureCatalog();
  } catch (err) {
    return {
      content: [{ type: "text", text: err.message }],
      isError: true,
    };
  }

  const { name, arguments: input = {} } = request.params;

  if (name === "attachment") {
    return handleAttachment(input);
  }

  const toolDef = toolMap.get(name);
  if (!toolDef) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  const args = [toolDef.command, ...buildCliArgs(toolDef, input)];

  // Sandboxed clients (Claude Cowork) can't follow the local filesystem paths
  // that the `thread` Attachments table normally prints, but they reflexively
  // try to read them before falling back to the `attachment` tool. Force the
  // CLI to drop the Path column so there is nothing tempting to chase - the
  // ID column plus the `attachment` tool covers everything.
  if (name === "thread" && !args.includes("--hide-attachment-paths")) {
    args.push("--hide-attachment-paths");
  }

  try {
    const { stdout, stderr } = await execFileAsync(SPARK_PATH, args, {
      timeout: EXEC_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
    });

    const output = stdout.trim();
    if (!output) {
      return {
        content: [{ type: "text", text: stderr.trim() || "(no output)" }],
      };
    }
    return { content: [{ type: "text", text: output }] };
  } catch (err) {
    const message = err.stderr?.trim() || err.message;
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// Special-case the `attachment` tool: ask the CLI for metadata (so we know the
// MIME type and size), enforce the MCP-side size cap, then ask the CLI again
// with --stream to fetch the bytes. The --stream pipe is the canonical
// "attachment bytes" channel - we deliberately do NOT re-read the local file
// path in JS so there is exactly one place where attachment bytes leave Spark
// Desktop.
async function handleAttachment(input) {
  const idRaw = input?.id;
  if (idRaw === undefined || idRaw === null || idRaw === "") {
    return {
      content: [
        { type: "text", text: "Error: 'id' parameter is required." },
      ],
      isError: true,
    };
  }
  const idStr = String(idRaw).trim();
  if (!/^\d+$/.test(idStr)) {
    return {
      content: [
        {
          type: "text",
          text: `Error: 'id' must be a positive integer, got: ${idStr}`,
        },
      ],
      isError: true,
    };
  }

  // -- Step 1: metadata. Also serves as a cheap auto-download trigger, so the
  // streaming call below is guaranteed to find the file on disk.
  let stdout;
  try {
    ({ stdout } = await execFileAsync(SPARK_PATH, ["attachment", idStr], {
      timeout: EXEC_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
    }));
  } catch (err) {
    const message = err.stderr?.trim() || err.message;
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }

  const output = stdout.trim();
  if (!output) {
    return {
      content: [
        { type: "text", text: "Error: spark CLI returned no output." },
      ],
      isError: true,
    };
  }
  if (output.startsWith("Error:")) {
    return {
      content: [{ type: "text", text: output }],
      isError: true,
    };
  }

  // Parse `Key: Value` lines into a plain object. Values can contain `: `
  // (URLs, MIME parameters), so we split on the first `: ` only.
  const parsed = {};
  for (const line of output.split("\n")) {
    const idx = line.indexOf(": ");
    if (idx === -1) continue;
    parsed[line.slice(0, idx).trim()] = line.slice(idx + 2);
  }

  // We deliberately don't require `Path` here - the MCP server doesn't read it.
  const requiredKeys = ["ID", "Name", "Size", "MIME Type", "Message ID"];
  const missing = requiredKeys.filter((k) => !(k in parsed));
  if (missing.length > 0) {
    return {
      content: [
        {
          type: "text",
          text: `Error: attachment ${idStr} CLI returned malformed metadata (missing: ${missing.join(", ")}).\nCLI output:\n${output}`,
        },
      ],
      isError: true,
    };
  }

  const sizeBytes = Number.parseInt(parsed.Size, 10);
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return {
      content: [
        {
          type: "text",
          text: `Error: attachment ${idStr} has invalid Size '${parsed.Size}'.`,
        },
      ],
      isError: true,
    };
  }

  if (sizeBytes > ATTACHMENT_MAX_BYTES) {
    return {
      content: [
        {
          type: "text",
          text: `Error: attachment ${idStr} is ${humanSize(sizeBytes)}, exceeds ${humanSize(ATTACHMENT_MAX_BYTES)} cap. Set SPARK_ATTACHMENT_MAX_BYTES to override, or open the email in Spark Desktop.`,
        },
      ],
      isError: true,
    };
  }

  // -- Step 2: stream the bytes back. `encoding: "buffer"` tells Node to give
  // us the raw stdout Buffer instead of a UTF-8 string. We size maxBuffer to
  // the cap plus a little slack so the cap itself is the only place size is
  // enforced. The CLI writes raw bytes to its stdout via a chunked
  // FileHandle.read loop inside SparklyRemote - we just collect them.
  let bytes;
  try {
    ({ stdout: bytes } = await execFileAsync(
      SPARK_PATH,
      ["attachment", "--stream", idStr],
      {
        timeout: EXEC_TIMEOUT_MS,
        maxBuffer: ATTACHMENT_MAX_BYTES + 1024,
        encoding: "buffer",
      },
    ));
  } catch (err) {
    const message =
      err.stderr?.toString("utf8").trim() || err.message;
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }

  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);

  const mime = parsed["MIME Type"] || "application/octet-stream";
  const name = parsed.Name || "(unnamed)";
  const messageId = parsed["Message ID"];
  const summary = `Attachment: ${name} (${humanSize(buf.length)}, ${mime}, message ${messageId})`;

  const content = [{ type: "text", text: summary }];
  if (mime.startsWith("image/")) {
    content.push({
      type: "image",
      data: buf.toString("base64"),
      mimeType: mime,
    });
  } else if (mime.startsWith("audio/")) {
    content.push({
      type: "audio",
      data: buf.toString("base64"),
      mimeType: mime,
    });
  } else if (mime.startsWith("text/") || TEXT_LIKE_MIMES.has(mime)) {
    content.push({ type: "text", text: buf.toString("utf8") });
  } else {
    content.push({
      type: "resource",
      resource: {
        uri: `spark-attachment://${idStr}`,
        mimeType: mime,
        blob: buf.toString("base64"),
      },
    });
  }

  return { content };
}

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[spark-mcp] server connected, waiting for requests");
