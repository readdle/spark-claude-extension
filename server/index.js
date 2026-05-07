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

const EXPECTED_SPARK_VERSION = "1.1.0";

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
    tools: catalog.tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: buildInputSchema(tool.parameters),
    })),
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

  const toolDef = toolMap.get(name);
  if (!toolDef) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  const args = [toolDef.command, ...buildCliArgs(toolDef, input)];

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

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[spark-mcp] server connected, waiting for requests");
