import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { theme } from "./theme.js";
import { loadConfig, saveConfig } from "../config/index.js";
import { describeLenses, getLens, listLensIds } from "../lenses/index.js";
import { runAgent, type Rhythm } from "../agent/loop.js";
import { aniqueSourceRoot } from "../meta/sourceRoot.js";
import { listSkills, saveSkill } from "../skills/index.js";
import type { ChatMessage } from "../providers/types.js";
import {
  exportSessionMarkdown,
  getSession,
  getSessionMessages,
  listSessions,
  resetDb,
  type SessionRow,
} from "../store/db.js";
import { ensureAniqueHome, aniqueHome } from "../config/index.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveModelId,
  pushRecentModel,
} from "../providers/models.js";
import { ModelsFlow } from "../providers/modelsFlow.js";
import {
  getActiveProfile,
  isModelReady,
  loadModelsForProfile,
} from "../providers/profiles.js";
import {
  compactHistory,
  formatContextBar,
  createUsageTracker,
  contextPct,
} from "../agent/usage.js";
import { formatTodos } from "../agent/todos.js";
import { undoLastSnapshot } from "../agent/undo.js";
import {
  clearSessionAllows,
  clearWebSearchConsent,
  sessionAllowCount,
  setApprovalHandler,
  unlockSession,
  lockSession,
  isSessionUnlocked,
  type ApprovalDecision,
  type ApprovalRequest,
} from "../safety/approval.js";
import {
  setClarifyHandler,
  setPlanHandler,
  setLearnHandler,
  type ClarifyAnswer,
  type ClarifyQuestion,
  type DeepPlan,
  type PlanDecision,
  type LearnDecision,
  type LearnItemView,
} from "../safety/interaction.js";
import {
  activateProfileEnv,
  currentProfileName,
  formatProfileList,
  useProfile,
} from "../profiles/agentProfiles.js";
import { Header } from "./components/Header.js";
import { Feed, type FeedItem, feedMaxScroll } from "./components/Feed.js";
import { StatusBar } from "./components/StatusBar.js";
import { Prompt } from "./components/Prompt.js";
import { ApprovalModal } from "./components/ApprovalModal.js";
import { ClarifyModal } from "./components/ClarifyModal.js";
import { PlanModal } from "./components/PlanModal.js";
import { LearnCard } from "./components/LearnCard.js";
import { ModelsPicker, type PickerRow } from "./components/ModelsPicker.js";
import { SessionPicker } from "./components/SessionPicker.js";
import { useEscEsc } from "./hooks/useEscEsc.js";
import type { DeepMode } from "../agent/deep.js";
import { getLastEvidencePack } from "../learn/lastMission.js";
import { runLearningPass } from "../learn/runLearning.js";
import type { Locale } from "../i18n/termFa.js";
import {
  ensureInbox,
  openInboxExternal,
  readInboxMessage,
  clearInbox,
  archiveInbox,
  inboxPath,
} from "../compose/inbox.js";
import { activatePrivateProfile } from "../profiles/privateCare.js";
import { listVersions, rollbackVersion } from "../versions/vault.js";

export interface TuiProps {
  lens: string;
  workspace: string;
  rhythm: Rhythm;
  sessionId?: string;
}

let feedSeq = 0;
const nid = () => `f_${++feedSeq}`;

function helpText(): string {
  return [
    "Slash: /deep  /fast  /new  /sessions  /models  /profile  /lens  /plan  /act  /cost",
    "       /atelier  /ingest  /compose  /send  /fa  /en  /redo  /learn  /private",
    "       /versions  /rollback  /context  /compact  /todos  /undo  /export  /quit",
    `Lenses: ${listLensIds().join(", ")}`,
    "atelier [private]: deep coding lens — /atelier then /ingest to learn this repo forever",
    "Persian: /compose opens inbox.md in a GUI editor · then /send",
    "Scroll: PgUp/PgDn through long answers · Private careful: /private",
    "Keys: Enter send · Esc interrupt · Esc Esc quit · Ctrl+L clear · ? help",
  ].join("\n");
}

function messagesToFeedAndHistory(sessionId: string): {
  feed: FeedItem[];
  history: ChatMessage[];
  lastAssistant: string;
} {
  const stored = getSessionMessages(sessionId);
  const feed: FeedItem[] = [];
  const history: ChatMessage[] = [];
  let lastAssistant = "";
  for (const m of stored) {
    if (m.role === "user") {
      feed.push({ id: nid(), kind: "user", text: m.content });
      history.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      feed.push({ id: nid(), kind: "assistant", text: m.content });
      let tool_calls: ChatMessage["tool_calls"];
      if (m.tool_calls_json) {
        try {
          tool_calls = JSON.parse(m.tool_calls_json) as ChatMessage["tool_calls"];
        } catch {
          tool_calls = undefined;
        }
      }
      history.push({
        role: "assistant",
        content: m.content,
        tool_calls,
      });
      lastAssistant = m.content;
    } else if (m.role === "tool") {
      feed.push({
        id: nid(),
        kind: "event",
        event: {
          ts: m.created_at,
          kind: "tool",
          summary: m.tool_name ?? "tool",
          detail: m.content.slice(0, 200),
        },
      });
      history.push({
        role: "tool",
        content: m.content,
        name: m.tool_name ?? undefined,
        tool_call_id: m.tool_call_id ?? undefined,
      });
    }
  }
  return { feed, history, lastAssistant };
}

export function AniqueTui(props: TuiProps): React.ReactElement {
  const { exit } = useApp();
  const [lens, setLens] = useState(props.lens);
  const [rhythm, setRhythm] = useState<Rhythm>(props.rhythm);
  const [workspace, setWorkspace] = useState(props.workspace);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [streamBuf, setStreamBuf] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>(props.sessionId);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [lastAssistant, setLastAssistant] = useState("");
  const [lastUserPrompt, setLastUserPrompt] = useState("");
  const [status, setStatus] = useState("ready");
  const [scrollLines, setScrollLines] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const usageRef = useRef(createUsageTracker(loadConfig().model || "unset"));
  const sessionUsageRef = useRef({ text: "" });
  const modelsFlowRef = useRef(new ModelsFlow());
  const [modelsMode, setModelsMode] = useState(false);
  const [config, setConfig] = useState(() => loadConfig());
  const locale: Locale = config.locale === "fa" ? "fa" : "en";
  const [profileName, setProfileName] = useState(() => currentProfileName());
  const [approvalReq, setApprovalReq] = useState<{
    req: ApprovalRequest;
    resolve: (d: ApprovalDecision) => void;
  } | null>(null);
  const [clarifyReq, setClarifyReq] = useState<{
    questions: ClarifyQuestion[];
    resolve: (a: ClarifyAnswer[]) => void;
  } | null>(null);
  const [planReq, setPlanReq] = useState<{
    plan: DeepPlan;
    resolve: (d: PlanDecision) => void;
  } | null>(null);
  const [learnReq, setLearnReq] = useState<{
    items: LearnItemView[];
    resolve: (d: LearnDecision) => void;
  } | null>(null);
  const [picker, setPicker] = useState<{
    title: string;
    rows: PickerRow[];
    selectedId?: string;
  } | null>(null);
  const [costTick, setCostTick] = useState(0);
  const [bootGate, setBootGate] = useState<"pending" | "picker" | "ready">(
    props.sessionId ? "ready" : "pending",
  );
  const [bootSessions, setBootSessions] = useState<SessionRow[]>([]);

  const modalOpen = Boolean(
    approvalReq ||
      clarifyReq ||
      planReq ||
      learnReq ||
      picker ||
      bootGate === "picker",
  );

  const stateRef = useRef({
    lens,
    rhythm,
    workspace,
    sessionId,
    history,
    lastAssistant,
    lastUserPrompt,
    busy,
    scrollLines,
  });
  useEffect(() => {
    stateRef.current = {
      lens,
      rhythm,
      workspace,
      sessionId,
      history,
      lastAssistant,
      lastUserPrompt,
      busy,
      scrollLines,
    };
  });

  useEffect(() => {
    const cfg = loadConfig();
    const modelHint = !isModelReady(cfg)
      ? "model: not set — type /models to choose a provider"
      : `model: ${cfg.model} · provider: ${cfg.provider}`;

    if (props.sessionId) {
      try {
        const ses = getSession(props.sessionId);
        if (ses) {
          setLens(ses.lens);
          setWorkspace(ses.workspace);
          const loaded = messagesToFeedAndHistory(props.sessionId);
          setFeed([
            {
              id: nid(),
              kind: "system",
              text: `Resumed ${props.sessionId} · ${ses.title}\n${modelHint}`,
            },
            ...loaded.feed,
          ]);
          setHistory(loaded.history);
          setLastAssistant(loaded.lastAssistant);
          const lastU = [...loaded.history]
            .reverse()
            .find((m) => m.role === "user")?.content;
          if (lastU) setLastUserPrompt(lastU);
          setStatus(`resumed ${props.sessionId}`);
          setBootGate("ready");
          return;
        }
      } catch {
        /* fall through to picker */
      }
    }

    const sessions = listSessions(20);
    setBootSessions(sessions);
    setBootGate("picker");
    setStatus("pick a chat · or New");
    setFeed([
      {
        id: nid(),
        kind: "system",
        text: modelHint,
      },
    ]);
  }, [props.sessionId]);

  const enterNewChat = useCallback(() => {
    const cfg = loadConfig();
    setSessionId(undefined);
    setHistory([]);
    setLastAssistant("");
    setScrollLines(0);
    setBootGate("ready");
    setStatus("ready");
    setFeed([
      {
        id: nid(),
        kind: "system",
        text: !isModelReady(cfg)
          ? "New chat · model: not set — /models to configure"
          : `New chat · ${cfg.model}\n/compose for Persian inbox · /private for careful mode · /sessions`,
      },
    ]);
  }, []);

  const enterResume = useCallback((ses: SessionRow) => {
    const loaded = messagesToFeedAndHistory(ses.id);
    setSessionId(ses.id);
    setLens(ses.lens);
    setWorkspace(ses.workspace);
    setHistory(loaded.history);
    setLastAssistant(loaded.lastAssistant);
    const lastU = [...loaded.history]
      .reverse()
      .find((m) => m.role === "user")?.content;
    if (lastU) setLastUserPrompt(lastU);
    setScrollLines(0);
    setBootGate("ready");
    setStatus(`resumed ${ses.id.slice(0, 18)}`);
    setFeed([
      {
        id: nid(),
        kind: "system",
        text: `Continued · ${ses.title}\n${ses.id}`,
      },
      ...loaded.feed,
    ]);
  }, []);

  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  const feedHeight = Math.max(
    8,
    rows - (showHelp ? 14 : 10) - (modalOpen ? 8 : 0),
  );

  // Calculate scroll information
  const feedMax = feedMaxScroll(feed, streamBuf, cols, feedHeight);
  const scrollPercent = scrollLines > 0 ? (scrollLines / feedMax * 100).toFixed(0) : "0";
  const scrollInfo = scrollLines > 0 ? `📜 ${scrollPercent}%` : "";

  useEffect(() => {
    setApprovalHandler(
      (req) =>
        new Promise<ApprovalDecision>((resolve) => {
          setApprovalReq({ req, resolve });
          setStatus("waiting on you · approval");
        }),
    );
    setClarifyHandler(
      (questions) =>
        new Promise<ClarifyAnswer[]>((resolve) => {
          setClarifyReq({ questions, resolve });
          setStatus("waiting on you · clarify");
          setFeed((f) => [
            ...f.slice(-300),
            {
              id: nid(),
              kind: "system",
              text: `clarify asked · ${questions.length} question(s)`,
            },
          ]);
        }),
    );
    setPlanHandler(
      (plan) =>
        new Promise<PlanDecision>((resolve) => {
          setPlanReq({ plan, resolve });
          setStatus("waiting on you · approve plan");
          setFeed((f) => [
            ...f.slice(-300),
            {
              id: nid(),
              kind: "system",
              text: `plan ready · ${plan.tasks.length} tasks · ${plan.goal.slice(0, 80)}`,
            },
          ]);
        }),
    );
    setLearnHandler(
      (items) =>
        new Promise<LearnDecision>((resolve) => {
          setLearnReq({ items, resolve });
          setStatus("waiting on you · learn");
          setFeed((f) => [
            ...f.slice(-300),
            {
              id: nid(),
              kind: "system",
              text: `learning · ${items.length} proposal(s) — keep as skill/memory?`,
            },
          ]);
        }),
    );
    return () => {
      setApprovalHandler(null);
      setClarifyHandler(null);
      setPlanHandler(null);
      setLearnHandler(null);
    };
  }, []);

  useEscEsc({
    busy,
    enabled: !modalOpen,
    onInterrupt: () => {
      if (abortRef.current) {
        abortRef.current.abort();
        setStatus("interrupting…");
      }
    },
    onQuit: () => exit(),
  });

  useInput((ch, key) => {
    if (modalOpen) return;
    if (key.ctrl && ch === "l") {
      setFeed([]);
      setScrollLines(0);
      setStatus("feed cleared (history kept)");
    }
    const page = Math.max(5, Math.floor(feedHeight / 2));
    if (key.pageUp) {
      setScrollLines((s) => {
        const max = feedMaxScroll(feed, streamBuf, cols, feedHeight);
        return Math.min(max, s + page);
      });
    }
    if (key.pageDown) setScrollLines((s) => Math.max(0, s - page));
    if (!busy && ch === "?" && input.length === 0) setShowHelp((h) => !h);

    // Arrow-key scrolling.
    // When the prompt is empty the cursor has nowhere to go in the text
    // input, so Up/Down scroll the feed line-by-line; Shift+Up/Down always
    // scroll faster (page-sized) even while typing.
    const inputEmpty = input.length === 0;
    const scrollBy = (delta: number) =>
      setScrollLines((s) => {
        const max = feedMaxScroll(feed, streamBuf, cols, feedHeight);
        return Math.max(0, Math.min(max, s + delta));
      });
    if (key.shift && key.upArrow) scrollBy(page * 2);
    else if (key.shift && key.downArrow) scrollBy(-page * 2);
    else if (inputEmpty && key.upArrow) scrollBy(3); // ↑ = scroll up (older)
    else if (inputEmpty && key.downArrow) scrollBy(-3); // ↓ = scroll down (newer)
  });

  const pushSystem = useCallback((text: string) => {
    setFeed((f) => [...f.slice(-300), { id: nid(), kind: "system", text }]);
    setScrollLines(0);
  }, []);

  const runMission = useCallback(
    async (
      prompt: string,
      lensOverride?: string,
      wsOverride?: string,
      deepMode?: DeepMode,
      opts?: { redo?: boolean },
    ) => {
      const s = stateRef.current;
      if (s.busy) return;
      const activeLens = lensOverride ?? s.lens;
      const activeWs = wsOverride ?? s.workspace;
      const ac = new AbortController();
      abortRef.current = ac;

      setBusy(true);
      setStatus(deepMode === "force" ? "deep · starting…" : "thinking…");
      setStreamBuf("");
      setScrollLines(0);
      setLastUserPrompt(prompt);

      let historyForRun = s.history;
      if (opts?.redo) {
        // Drop trailing assistant/tool turns so the model retries cleanly
        const h = [...s.history];
        while (h.length && h[h.length - 1]!.role !== "user") h.pop();
        if (h.length && h[h.length - 1]!.role === "user") h.pop();
        historyForRun = h;
        setHistory(h);
        setFeed((f) => {
          const next = [...f];
          while (next.length) {
            const last = next[next.length - 1]!;
            if (last.kind === "assistant" || last.kind === "event") {
              next.pop();
              continue;
            }
            break;
          }
          return [
            ...next.slice(-300),
            {
              id: nid(),
              kind: "system",
              text: "redo · last message",
            },
            { id: nid(), kind: "user", text: prompt },
          ];
        });
      } else {
        setFeed((f) => [
          ...f.slice(-300),
          { id: nid(), kind: "user", text: prompt },
        ]);
      }

      try {
        const result = await runAgent({
          config: loadConfig(),
          lensId: activeLens,
          workspace: activeWs,
          userMessage: prompt,
          rhythm: s.rhythm,
          sessionId: s.sessionId,
          history: historyForRun,
          quiet: true,
          signal: ac.signal,
          deepMode,
          onDeepStatus: (msg) => setStatus(msg),
          onToken: (tok) => {
            setStreamBuf((prev) => prev + tok);
            setStatus("streaming…");
          },
          onEvent: (ev) => {
            if (ev.kind === "assistant") return;
            // TUI already renders the user bubble — skip duplicate trace
            if (ev.kind === "user") return;
            // Hide internal step counters from the feed
            if (ev.kind === "system" && /^model step\b/i.test(ev.summary)) {
              return;
            }
            setFeed((f) => [
              ...f.slice(-300),
              { id: nid(), kind: "event", event: ev },
            ]);
            if (ev.kind === "tool") setStatus(`tool ${ev.summary}`);
            if (
              ev.kind === "system" &&
              /^(learning|learned|skipped learn|weak answer)/.test(ev.summary)
            ) {
              setStatus(ev.summary.slice(0, 60));
            }
          },
          onUsage: (text) => {
            sessionUsageRef.current.text = text;
            setCostTick((tick) => tick + 1);
          },
        });

        setSessionId(result.sessionId);
        setLastAssistant(result.finalText);
        setHistory(result.messages.filter((m) => m.role !== "system"));
        setStreamBuf("");
        setCostTick((tick) => tick + 1);
        if (result.finalText) {
          setFeed((f) => [
            ...f.slice(-300),
            { id: nid(), kind: "assistant", text: result.finalText },
          ]);
        }
        setStatus(
          result.aborted
            ? `interrupted · ${result.sessionId}`
            : `done · ${result.steps} steps · ${result.toolCallCount} tools · ${result.sessionId}`,
        );
      } catch (err) {
        setStreamBuf("");
        pushSystem(err instanceof Error ? err.message : String(err));
        setStatus("error");
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [pushSystem],
  );

  const handleSlash = useCallback(
    async (raw: string) => {
      const [cmd, ...rest] = raw.slice(1).split(/\s+/);
      switch (cmd) {
        case "help":
          setShowHelp((h) => !h);
          pushSystem(helpText());
          break;
        case "deep": {
          const p = rest.join(" ").trim();
          if (!p) {
            pushSystem("Usage: /deep <prompt> — force quality path (clarify + plan gate)");
            break;
          }
          await runMission(p, undefined, undefined, "force");
          break;
        }
        case "fast": {
          const p = rest.join(" ").trim();
          if (!p) {
            pushSystem("Usage: /fast <prompt> — skip deep triage, single pass");
            break;
          }
          await runMission(p, undefined, undefined, "off");
          break;
        }
        case "models":
        case "model": {
          const arg = rest.join(" ").trim();
          if (arg && !arg.startsWith("+") && isModelReady()) {
            const model = resolveModelId(arg);
            const next = saveConfig({ model });
            setConfig(next);
            pushRecentModel(model);
            usageRef.current = createUsageTracker(model);
            pushSystem(`model → ${model}`);
            break;
          }
          if ((arg === "+" || arg === "add") || !isModelReady()) {
            setBusy(true);
            setStatus("models…");
            try {
              const msg = await modelsFlowRef.current.start({
                forceAddProvider: arg === "+" || arg === "add",
              });
              setModelsMode(true);
              pushSystem(msg);
              setStatus("models wizard · reply below");
            } catch (err) {
              pushSystem(String(err));
            } finally {
              setBusy(false);
            }
            break;
          }
          // Configured: navigable picker of API models
          setBusy(true);
          setStatus("loading models…");
          try {
            const active = getActiveProfile();
            const cfg = loadConfig();
            const models = await loadModelsForProfile(
              active ?? {
                provider: cfg.provider,
                baseUrl: cfg.baseUrl,
                apiKey: cfg.apiKey,
                model: cfg.model,
              },
            );
            setPicker({
              title: `Models · ${cfg.provider} · + add provider`,
              selectedId: cfg.model,
              rows: models.slice(0, 80).map((m) => ({
                id: m.id,
                label: m.id,
                hint: m.id === cfg.model ? "(active)" : undefined,
              })),
            });
            setStatus("pick a model ↑↓");
          } catch (err) {
            pushSystem(String(err));
            const msg = await modelsFlowRef.current.start();
            setModelsMode(true);
            pushSystem(msg);
          } finally {
            setBusy(false);
          }
          break;
        }
        case "cost":
          pushSystem(
            sessionUsageRef.current.text ||
              usageRef.current.format() + "\n(no completed turns yet this session)",
          );
          break;
        case "context":
          pushSystem(
            formatContextBar(
              [
                { role: "system", content: "" },
                ...stateRef.current.history,
              ],
              loadConfig().model,
            ),
          );
          break;
        case "compact": {
          try {
            const result = await compactHistory(
              loadConfig(),
              [
                { role: "system", content: "anique" },
                ...stateRef.current.history,
              ],
            );
            if (!result.ok) {
              pushSystem(`compact aborted — history unchanged (${result.error})`);
              break;
            }
            setHistory(result.messages.filter((m) => m.role !== "system"));
            if (stateRef.current.sessionId && result.compacted > 0) {
              const { appendMessage, appendTrace } = await import(
                "../store/db.js"
              );
              appendMessage({
                sessionId: stateRef.current.sessionId,
                role: "system",
                content: `[compacted ${result.compacted} messages]`,
              });
              appendTrace(stateRef.current.sessionId, {
                ts: new Date().toISOString(),
                kind: "system",
                summary: `compacted ${result.compacted} messages`,
              });
            }
            pushSystem(
              `Compacted ${result.compacted} messages. ` +
                formatContextBar(result.messages, loadConfig().model),
            );
          } catch (err) {
            pushSystem(`compact failed: ${String(err)}`);
          }
          break;
        }
        case "profile": {
          const sub = rest[0];
          if (!sub || sub === "list") {
            pushSystem(formatProfileList());
            break;
          }
          if (sub === "use" && rest[1]) {
            try {
              const p = useProfile(rest[1]);
              resetDb();
              activateProfileEnv(p.name);
              setProfileName(currentProfileName());
              setConfig(loadConfig());
              setHistory([]);
              setSessionId(undefined);
              setFeed([]);
              clearSessionAllows();
              pushSystem(
                `profile → ${p.name}\n${p.path}\n(history cleared — sessions are per-profile)`,
              );
            } catch (err) {
              pushSystem(String(err));
            }
            break;
          }
          pushSystem(
            "Usage: /profile | /profile list | /profile use <name>\n" +
              "CLI: anique profile create <name> [--clone]",
          );
          break;
        }
        case "todos":
          pushSystem(formatTodos());
          break;
        case "undo": {
          const r = undoLastSnapshot({
            aggressive: rest[0] === "--aggressive",
          });
          pushSystem(r.message);
          break;
        }
        case "permissions": {
          const mode = rest[0];
          if (!mode) {
            pushSystem(
              `approvalMode=${loadConfig().approvalMode}  (suggest|allowlist|auto)`,
            );
            break;
          }
          if (!["suggest", "allowlist", "auto"].includes(mode)) {
            pushSystem("Use: /permissions suggest|allowlist|auto");
            break;
          }
          saveConfig({
            approvalMode: mode as "suggest" | "allowlist" | "auto",
          });
          pushSystem(`permissions → ${mode}`);
          break;
        }
        case "quit":
        case "exit":
          exit();
          break;
        case "lens": {
          const name = rest[0];
          if (!name) {
            pushSystem(describeLenses());
            break;
          }
          getLens(name);
          setLens(name);
          pushSystem(`lens → ${name}`);
          break;
        }
        case "atelier": {
          const { ensureAtelierLens, ATELIER_LENS_ID } = await import(
            "../lenses/privateLenses.js"
          );
          ensureAtelierLens();
          getLens(ATELIER_LENS_ID);
          setLens(ATELIER_LENS_ID);
          pushSystem(
            [
              "lens → atelier [private]",
              "Deep coding · durable project memory under ~/.anique/private/projects/",
              "Run /ingest to scan this workspace and remember it.",
            ].join("\n"),
          );
          setStatus("atelier · private code");
          break;
        }
        case "ingest": {
          setBusy(true);
          setStatus("ingest · scanning project…");
          try {
            const { runTool } = await import("../tools/registry.js");
            const deep = rest[0] === "deep";
            const result = await runTool(
              "project_ingest",
              JSON.stringify({ deep }),
              {
                workspace: stateRef.current.workspace,
                lens: stateRef.current.lens || "atelier",
                approvalMode: loadConfig().approvalMode,
                rhythm: stateRef.current.rhythm,
              },
            );
            pushSystem(result.output);
            if (stateRef.current.lens !== "atelier") {
              const { ensureAtelierLens, ATELIER_LENS_ID } = await import(
                "../lenses/privateLenses.js"
              );
              ensureAtelierLens();
              setLens(ATELIER_LENS_ID);
              pushSystem("switched to atelier so project memory stays loaded");
            }
            setStatus("ingest done");
          } catch (err) {
            pushSystem(err instanceof Error ? err.message : String(err));
            setStatus("error");
          } finally {
            setBusy(false);
          }
          break;
        }
        case "plan":
          setRhythm("plan");
          pushSystem("rhythm → plan");
          break;
        case "act":
          setRhythm("act");
          pushSystem("rhythm → act");
          break;
        case "evolve": {
          const root = aniqueSourceRoot();
          setLens("evolve");
          setWorkspace(root);
          pushSystem(`evolve · workspace → ${root}`);
          const p = rest.join(" ").trim();
          if (p) await runMission(p, "evolve", root);
          break;
        }
        case "sessions": {
          const rows = listSessions(20);
          setBootSessions(rows);
          setBootGate("picker");
          setStatus("pick a chat · or New");
          pushSystem("Session picker open — ↑↓ Enter · n = new");
          break;
        }
        case "new": {
          enterNewChat();
          break;
        }
        case "resume": {
          const id = rest[0] || listSessions(1)[0]?.id;
          if (!id) {
            pushSystem("No session to resume.");
            break;
          }
          const ses = getSession(id);
          if (!ses) {
            pushSystem(`Not found: ${id}`);
            break;
          }
          enterResume(ses);
          break;
        }
        case "export": {
          const id = rest[0] || stateRef.current.sessionId;
          if (!id) {
            pushSystem("No session to export.");
            break;
          }
          ensureAniqueHome();
          const md = exportSessionMarkdown(id);
          const path = join(aniqueHome(), "exports", `${id}.md`);
          writeFileSync(path, md, "utf8");
          pushSystem(`Exported → ${path}`);
          break;
        }
        case "skills":
          pushSystem(
            listSkills(stateRef.current.lens).join(", ") || "(none)",
          );
          break;
        case "skill": {
          if (rest[0] === "save" && rest[1] && stateRef.current.lastAssistant) {
            const path = saveSkill(
              stateRef.current.lens,
              rest[1],
              `# Skill: ${rest[1]}\n\n${stateRef.current.lastAssistant}\n`,
            );
            pushSystem(`saved ${path}`);
          } else {
            pushSystem("Usage: /skill save <name>");
          }
          break;
        }
        case "learn": {
          const arg = (rest[0] || "").toLowerCase();
          if (arg === "off" || arg === "on") {
            const next = saveConfig({ learning: arg });
            setConfig(next);
            pushSystem(`learning → ${arg}`);
            break;
          }
          const pack = getLastEvidencePack();
          if (!pack) {
            pushSystem("No last mission to learn from yet.");
            break;
          }
          setBusy(true);
          setStatus("learning · proposing…");
          try {
            const lr = await runLearningPass({
              config: loadConfig(),
              pack,
              force: true,
              onStatus: (msg) => setStatus(msg),
              onEvent: (ev) => {
                setFeed((f) => [
                  ...f.slice(-300),
                  { id: nid(), kind: "event", event: ev },
                ]);
                setStatus(ev.summary.slice(0, 60));
              },
            });
            if (lr.applied.length) {
              pushSystem(
                `kept ${lr.applied.map((a) => `${a.kind}:${a.title}`).join(", ")}`,
              );
            }
            setStatus("ready");
          } catch (err) {
            pushSystem(err instanceof Error ? err.message : String(err));
            setStatus("error");
          } finally {
            setBusy(false);
          }
          break;
        }
        case "compose":
        case "inbox": {
          ensureInbox();
          const opened = openInboxExternal();
          pushSystem(
            [
              "Compose outside the terminal (Persian renders correctly in a GUI editor).",
              `File: ${opened.path}`,
              `Opened with: ${opened.how}`,
              "Write your message below the line, save, then type /send",
            ].join("\n"),
          );
          setStatus("compose · edit inbox.md · /send");
          break;
        }
        case "send": {
          const body = readInboxMessage();
          if (!body.trim()) {
            pushSystem(
              `Inbox empty. Edit ${inboxPath()} then /send (or /compose to open it).`,
            );
            break;
          }
          archiveInbox(body);
          clearInbox();
          await runMission(body);
          break;
        }
        case "fa":
        case "فارسی": {
          const next = saveConfig({ locale: "fa" });
          setConfig(next);
          ensureInbox();
          const opened = openInboxExternal();
          pushSystem(
            [
              "fa-reply on · UI stays English.",
              "Type Persian in a GUI editor (not the TTY):",
              `  ${opened.path}`,
              `Opened: ${opened.how} · then /send`,
              "Or keep typing English here; replies will be Persian.",
            ].join("\n"),
          );
          setStatus("fa-reply · /compose · /send");
          break;
        }
        case "en":
        case "english": {
          const next = saveConfig({ locale: "en" });
          setConfig(next);
          pushSystem("Replies: English · UI unchanged");
          setStatus("en");
          break;
        }
        case "private": {
          try {
            const info = activatePrivateProfile();
            activateProfileEnv(info.name);
            setProfileName(info.name);
            setConfig(loadConfig());
            setHistory([]);
            setSessionId(undefined);
            setLastAssistant("");
            clearSessionAllows();
            pushSystem(
              [
                info.created
                  ? `Created private profile → ${info.path}`
                  : `Switched to private profile → ${info.path}`,
                "Careful mode ON · writes keep prior versions · /versions · /rollback <id>",
                "Not part of the public/default home. /profile use default to leave.",
              ].join("\n"),
            );
            setStatus("private · careful");
          } catch (err) {
            pushSystem(String(err));
          }
          break;
        }
        case "versions": {
          const rows = listVersions(15);
          if (!rows.length) {
            pushSystem("No saved priors yet (created on write_file / apply_patch).");
            break;
          }
          pushSystem(
            rows
              .map(
                (r) =>
                  `${r.id.slice(0, 28)}…  ${r.bytes}b  ${r.originalPath}  ${r.savedAt.slice(0, 19)}`,
              )
              .join("\n"),
          );
          break;
        }
        case "rollback": {
          const id = rest[0];
          if (!id) {
            pushSystem("Usage: /rollback <version-id-prefix>");
            break;
          }
          const r = rollbackVersion(id);
          pushSystem(r.ok ? r.message : `rollback failed · ${r.message}`);
          break;
        }
        case "redo":
        case "retry": {
          const prompt =
            stateRef.current.lastUserPrompt ||
            [...stateRef.current.history]
              .reverse()
              .find((m) => m.role === "user")?.content ||
            "";
          if (!prompt.trim()) {
            pushSystem("Nothing to redo yet.");
            break;
          }
          await runMission(prompt, undefined, undefined, undefined, {
            redo: true,
          });
          break;
        }
        case "clear":
          setFeed([]);
          setHistory([]);
          setSessionId(undefined);
          clearSessionAllows();
          clearWebSearchConsent();
          lockSession();
          const { clearPendingSudo } = await import("../tools/registry.js");
          clearPendingSudo();
          pushSystem("cleared");
          break;
        case "sudo":
        case "pending": {
          const { pendingSudoCommands } = await import("../tools/registry.js");
          const list = pendingSudoCommands();
          if (!list.length) {
            pushSystem("No commands are waiting for sudo permission.");
            break;
          }
          pushSystem(
            `${list.length} command(s) need your password — run them yourself:\n` +
              list.map((p) => `  $ ${p.command}`).join("\n"),
          );
          break;
        }
        case "unlock":
          unlockSession();
          setStatus("unlocked · no more approvals this session");
          pushSystem("🔓 session unlocked — every command runs without asking. /lock to re-enable.");
          break;
        case "lock":
          lockSession();
          setStatus("locked · approvals on again");
          pushSystem("🔒 session locked — approvals re-enabled. /unlock to trust the session.");
          break;
        case "config": {
          const c = loadConfig();
          pushSystem(
            JSON.stringify(
              {
                model: c.model,
                provider: c.provider,
                approvalMode: c.approvalMode,
                learning: c.learning,
                locale: c.locale,
                hasKey: Boolean(c.apiKey),
                ui: c.ui,
              },
              null,
              2,
            ),
          );
          break;
        }
        default:
          pushSystem(`Unknown /${cmd}. Try /help`);
      }
    },
    [exit, pushSystem, runMission, enterNewChat, enterResume],
  );

  const onSubmit = async (value: string) => {
    const trimmed = value.trim();
    setInput("");
    if (!trimmed || stateRef.current.busy) return;
    if (bootGate !== "ready") return;

    if (modelsMode) {
      const flowCmd = trimmed.replace(/^\//, "");
      if (
        trimmed.startsWith("/") &&
        !/^(cancel|exit|quit)$/i.test(flowCmd)
      ) {
        modelsFlowRef.current.cancel();
        setModelsMode(false);
        await handleSlash(trimmed);
        return;
      }
      setBusy(true);
      setStatus("models…");
      try {
        const result = await modelsFlowRef.current.handle(
          trimmed.startsWith("/") ? flowCmd : trimmed,
        );
        pushSystem(result.message);
        if (result.done) {
          setModelsMode(false);
          const cfg = loadConfig();
          setConfig(cfg);
          if (isModelReady(cfg)) {
            usageRef.current = createUsageTracker(cfg.model);
          }
          setStatus("ready");
        } else {
          setStatus("models wizard · reply below");
        }
      } catch (err) {
        pushSystem(String(err));
        setModelsMode(false);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (trimmed.startsWith("/")) {
      await handleSlash(trimmed);
      return;
    }

    if (!isModelReady(config)) {
      pushSystem("model: not set — type /models to configure a provider");
      return;
    }

    await runMission(trimmed);
  };

  const snap = usageRef.current.snapshot();
  void costTick;
  const ctx = contextPct(
    [{ role: "system", content: "" }, ...history],
    config.model || "default",
  );

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Header
        profile={profileName}
        lens={lens}
        rhythm={rhythm}
        modelLabel={config.model}
        modelReady={isModelReady(config)}
        sessionId={sessionId}
        workspace={workspace}
        ctxPct={ctx.pct}
        costUsd={snap.estimatedUsd}
        cols={cols}
        locale={locale}
        scrollInfo={scrollInfo}
      />

      <Feed
        items={feed}
        streamBuf={streamBuf}
        height={feedHeight}
        scrollLines={scrollLines}
        width={cols}
      />

      {showHelp ? (
        <Box borderStyle="single" borderColor={theme.border} paddingX={1}>
          <Text color={theme.gold}>{helpText()}</Text>
        </Box>
      ) : null}

      {bootGate === "picker" ? (
        <SessionPicker
          sessions={bootSessions}
          width={cols}
          onNew={enterNewChat}
          onResume={enterResume}
        />
      ) : null}

      {approvalReq ? (
        <ApprovalModal
          prompt={approvalReq.req.prompt}
          risk={approvalReq.req.risk}
          tool={approvalReq.req.tool}
          preview={approvalReq.req.preview}
          permissionMode={approvalReq.req.permissionMode}
          sessionAllowCount={sessionAllowCount()}
          onDecide={(d) => {
            const resolve = approvalReq.resolve;
            setApprovalReq(null);
            resolve(d);
          }}
        />
      ) : null}

      {clarifyReq ? (
        <ClarifyModal
          questions={clarifyReq.questions}
          onCancel={() => {
            const resolve = clarifyReq.resolve;
            setClarifyReq(null);
            resolve(
              clarifyReq.questions.map((q) => ({
                id: q.id,
                answer: "(cancelled)",
              })),
            );
          }}
          onDone={(answers) => {
            const resolve = clarifyReq.resolve;
            setClarifyReq(null);
            pushSystem("clarify answered");
            resolve(answers);
          }}
        />
      ) : null}

      {planReq ? (
        <PlanModal
          plan={planReq.plan}
          onDecide={(d) => {
            const resolve = planReq.resolve;
            setPlanReq(null);
            if (d.action === "approve") pushSystem("plan approved");
            if (d.action === "cancel") pushSystem("plan cancelled");
            if (d.action === "edit") pushSystem(`plan edit: ${d.note}`);
            resolve(d);
          }}
        />
      ) : null}

      {learnReq ? (
        <LearnCard
          items={learnReq.items}
          onDecide={(d) => {
            const resolve = learnReq.resolve;
            setLearnReq(null);
            if (d.action === "skip") {
              pushSystem("skipped learn · you chose not to keep");
              setStatus("ready");
            } else {
              setStatus("learning · applying…");
            }
            resolve(d);
          }}
        />
      ) : null}

      {picker ? (
        <ModelsPicker
          title={picker.title}
          rows={picker.rows}
          selectedId={picker.selectedId}
          width={cols}
          onCancel={() => {
            setPicker(null);
            setStatus("ready");
          }}
          onAddProvider={() => {
            setPicker(null);
            void (async () => {
              const msg = await modelsFlowRef.current.start({
                forceAddProvider: true,
              });
              setModelsMode(true);
              pushSystem(msg);
              setStatus("models wizard · reply below");
            })();
          }}
          onSelect={(row) => {
            const next = saveConfig({ model: row.id });
            setConfig(next);
            pushRecentModel(row.id);
            usageRef.current = createUsageTracker(row.id);
            setPicker(null);
            pushSystem(`model → ${row.id}`);
            setStatus("ready");
          }}
        />
      ) : null}

      <StatusBar
        busy={busy}
        status={status}
        width={cols}
        unlocked={isSessionUnlocked()}
        scrollInfo={scrollLines > 0 ? `📜 ${scrollPercent}%` : ""}
        feedLength={feed.length}
        sessionId={sessionId}
      />

      <Prompt
        value={input}
        onChange={setInput}
        onSubmit={(v) => void onSubmit(v)}
        busy={busy || bootGate !== "ready"}
        modelsMode={modelsMode}
        modelReady={isModelReady(config)}
        focused={!busy && !modalOpen && bootGate === "ready"}
        width={cols}
      />
    </Box>
  );
}

export async function startTui(props: TuiProps): Promise<void> {
  const { render } = await import("ink");
  const instance = render(React.createElement(AniqueTui, props));
  await instance.waitUntilExit();
}
