import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
	truncateTail,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const DEFAULT_BASE_URL = "https://api.axiom.co";
const DEFAULT_HISTORY_HOURS = 24;

interface AxiomConfig {
	baseUrl: string;
	token: string;
}

function getConfig(): AxiomConfig {
	const token = process.env.AXIOM_TOKEN?.trim();
	if (!token) {
		throw new Error("Missing AXIOM_TOKEN environment variable.");
	}

	const baseUrl = (process.env.AXIOM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
	return { baseUrl, token };
}

function isoHoursAgo(hours: number): string {
	return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function nowIso(): string {
	return new Date().toISOString();
}

function toText(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

function truncateJson(value: unknown, mode: "head" | "tail" = "head"): string {
	const text = toText(value);
	const truncation = (mode === "tail" ? truncateTail : truncateHead)(text, {
		maxBytes: DEFAULT_MAX_BYTES,
		maxLines: DEFAULT_MAX_LINES,
	});

	if (!truncation.truncated) return truncation.content;

	return `${truncation.content}\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)})]`;
}

async function axiomFetch(config: AxiomConfig, path: string, init?: RequestInit): Promise<unknown> {
	const response = await fetch(`${config.baseUrl}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${config.token}`,
			"Content-Type": "application/json",
			...(init?.headers || {}),
		},
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Axiom API error ${response.status} ${response.statusText}: ${body}`);
	}

	return response.status === 204 ? {} : await response.json();
}

export default function axiomDebugExtension(pi: ExtensionAPI) {
	pi.registerCommand("axiom-config", {
		description: "Configure your Axiom API token interactively",
		handler: async (_args, ctx) => {
			const existing = process.env.AXIOM_TOKEN?.trim();
			if (existing) {
				ctx.ui.notify("✅ AXIOM_TOKEN is already set in your environment.", "info");
				ctx.ui.notify(
					"Make sure the token has read access for all datasets and monitors.",
					"info",
				);
				return;
			}

			ctx.ui.notify(
				"Before generating or pasting a token, make sure it has read access for all datasets and monitors in Axiom.",
				"warn",
			);

			const token = await ctx.ui.input({
				title: "Axiom API Token",
				placeholder: "xapt-...",
				validate: (value) =>
					value.trim().length > 0 ? undefined : "Token cannot be empty",
			});
			if (!token) return;

			process.env.AXIOM_TOKEN = token.trim();
			ctx.ui.notify("✅ AXIOM_TOKEN set for this session.", "success");
			ctx.ui.notify(
				"Tip: add export AXIOM_TOKEN=… to your shell profile to persist across sessions.",
				"info",
			);
		},
	});

	pi.registerTool({
		name: "axiom_list_datasets",
		label: "Axiom List Datasets",
		description: "List Axiom datasets available to the configured token.",
		promptSnippet: "List Axiom datasets before querying logs when the dataset name is unknown.",
		promptGuidelines: ["Use axiom_list_datasets when you need to discover the dataset name before running an APL query."],
		parameters: Type.Object({}),
		async execute() {
			const data = await axiomFetch(getConfig(), "/v2/datasets");
			return {
				content: [{ type: "text", text: truncateJson(data) }],
				details: { data },
			};
		},
	});

	pi.registerTool({
		name: "axiom_query_logs",
		label: "Axiom Query Logs",
		description: "Run an Axiom APL query against logs, traces, or event datasets.",
		promptSnippet: "Query Axiom datasets with APL for logs and operational debugging.",
		promptGuidelines: [
			"Use axiom_query_logs for targeted APL searches instead of guessing log output.",
			"When debugging alerts, prefer a bounded time window with startTime and endTime.",
		],
		parameters: Type.Object({
			apl: Type.String({ description: "APL query to run, e.g. ['prod-logs'] | where level == 'error' | limit 100" }),
			startTime: Type.Optional(Type.String({ description: "ISO-8601 start time" })),
			endTime: Type.Optional(Type.String({ description: "ISO-8601 end time" })),
			nocache: Type.Optional(Type.Boolean({ description: "Disable Axiom query cache" })),
		}),
		async execute(_toolCallId, params) {
			const body = {
				apl: params.apl,
				...(params.startTime ? { startTime: params.startTime } : {}),
				...(params.endTime ? { endTime: params.endTime } : {}),
			};
			const nocache = params.nocache ? "&nocache=true" : "";
			const data = await axiomFetch(getConfig(), `/v1/datasets/_apl?format=tabular${nocache}`, {
				method: "POST",
				body: JSON.stringify(body),
			});

			return {
				content: [{ type: "text", text: truncateJson(data) }],
				details: { request: body, data },
			};
		},
	});

	pi.registerTool({
		name: "axiom_list_monitors",
		label: "Axiom List Monitors",
		description: "List Axiom monitors used for alerts.",
		promptSnippet: "List Axiom monitors when you need to inspect alert definitions.",
		promptGuidelines: ["Use axiom_list_monitors to discover alert/monitor IDs before fetching details or history."],
		parameters: Type.Object({}),
		async execute() {
			const data = await axiomFetch(getConfig(), "/v2/monitors");
			return {
				content: [{ type: "text", text: truncateJson(data) }],
				details: { data },
			};
		},
	});

	pi.registerTool({
		name: "axiom_get_monitor",
		label: "Axiom Get Monitor",
		description: "Fetch a single Axiom monitor definition, including its query and thresholds.",
		promptSnippet: "Inspect a specific Axiom monitor to understand how an alert is configured.",
		parameters: Type.Object({
			monitorId: Type.String({ description: "Axiom monitor ID" }),
		}),
		async execute(_toolCallId, params) {
			const data = await axiomFetch(getConfig(), `/v2/monitors/${encodeURIComponent(params.monitorId)}`);
			return {
				content: [{ type: "text", text: truncateJson(data) }],
				details: { data },
			};
		},
	});

	pi.registerTool({
		name: "axiom_get_monitor_history",
		label: "Axiom Get Monitor History",
		description: "Fetch open/closed history for an Axiom monitor within a time window.",
		promptSnippet: "Inspect Axiom monitor history to see when alerts opened or closed.",
		parameters: Type.Object({
			monitorId: Type.String({ description: "Axiom monitor ID" }),
			startTime: Type.Optional(Type.String({ description: "ISO-8601 start time; defaults to 24 hours ago" })),
			endTime: Type.Optional(Type.String({ description: "ISO-8601 end time; defaults to now" })),
		}),
		async execute(_toolCallId, params) {
			const startTime = params.startTime || isoHoursAgo(DEFAULT_HISTORY_HOURS);
			const endTime = params.endTime || nowIso();
			const query = new URLSearchParams({ startTime, endTime });
			const data = await axiomFetch(
				getConfig(),
				`/v2/monitors/${encodeURIComponent(params.monitorId)}/history?${query.toString()}`,
			);
			return {
				content: [{ type: "text", text: truncateJson(data, "tail") }],
				details: { startTime, endTime, data },
			};
		},
	});

	pi.registerTool({
		name: "axiom_debug_alert",
		label: "Axiom Debug Alert",
		description: "Collect the key data needed to debug an Axiom alert: monitor config, recent alert history, and query results for the same time window.",
		promptSnippet: "Debug an Axiom alert by collecting the monitor config, alert history, and underlying query output.",
		promptGuidelines: [
			"Use axiom_debug_alert when the user wants to investigate why an Axiom alert fired or resolved.",
			"If the monitor has an aplQuery, this tool will run it over the requested time window.",
		],
		parameters: Type.Object({
			monitorId: Type.String({ description: "Axiom monitor ID" }),
			startTime: Type.Optional(Type.String({ description: "ISO-8601 start time; defaults to 24 hours ago" })),
			endTime: Type.Optional(Type.String({ description: "ISO-8601 end time; defaults to now" })),
			nocache: Type.Optional(Type.Boolean({ description: "Disable Axiom query cache for the embedded query" })),
		}),
		async execute(_toolCallId, params) {
			const config = getConfig();
			const startTime = params.startTime || isoHoursAgo(DEFAULT_HISTORY_HOURS);
			const endTime = params.endTime || nowIso();
			const historyQuery = new URLSearchParams({ startTime, endTime });

			const monitor = await axiomFetch(config, `/v2/monitors/${encodeURIComponent(params.monitorId)}`);
			const history = await axiomFetch(
				config,
				`/v2/monitors/${encodeURIComponent(params.monitorId)}/history?${historyQuery.toString()}`,
			);

			const aplQuery = typeof monitor === "object" && monitor && "aplQuery" in monitor ? (monitor as { aplQuery?: unknown }).aplQuery : undefined;
			let queryResult: unknown = { skipped: true, reason: "Monitor does not expose an aplQuery" };

			if (typeof aplQuery === "string" && aplQuery.trim().length > 0) {
				const nocache = params.nocache ? "&nocache=true" : "";
				queryResult = await axiomFetch(config, `/v1/datasets/_apl?format=tabular${nocache}`, {
					method: "POST",
					body: JSON.stringify({
						apl: aplQuery,
						startTime,
						endTime,
					}),
				});
			}

			const payload = {
				monitor,
				historyWindow: { startTime, endTime },
				history,
				queryResult,
			};

			return {
				content: [{ type: "text", text: truncateJson(payload) }],
				details: payload,
			};
		},
	});
}
