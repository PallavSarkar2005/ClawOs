import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { Plus, X, Terminal } from "lucide-react";
import * as projectApi from "../../api/projectApi";

export default function XTermTerminal({ projectId, active }) {
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const wsRef = useRef(null);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [status, setStatus] = useState("idle");
  const historyRef = useRef([]);
  const histIdx = useRef(-1);
  const lineBuf = useRef("");

  const loadSessions = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await projectApi.listTerminals(projectId);
      setSessions(data.stored || []);
      if (!activeSessionId && data.stored?.[0]) {
        setActiveSessionId(data.stored[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  }, [projectId, activeSessionId]);

  useEffect(() => {
    loadSessions();
  }, [projectId]); // eslint-disable-line

  const connect = useCallback(
    (sessionId) => {
      if (!projectId || !hostRef.current) return;
      wsRef.current?.close();
      termRef.current?.dispose();

      const term = new XTerm({
        cursorBlink: true,
        fontSize: 12,
        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
        theme: {
          background: "#0B1220",
          foreground: "#E2E8F0",
          cursor: "#F15B42",
          selectionBackground: "#24335F",
          black: "#0F172A",
          red: "#EF4444",
          green: "#22C55E",
          yellow: "#F59E0B",
          blue: "#7CAADC",
          magenta: "#F49CC4",
          cyan: "#22D3EE",
          white: "#F1F5F9",
        },
        allowProposedApi: true,
        scrollback: 5000,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());
      term.open(hostRef.current);
      fit.fit();
      termRef.current = term;
      fitRef.current = fit;

      const cols = term.cols;
      const rows = term.rows;
      const wsUrl = projectApi.getTerminalWsUrl(projectId, sessionId, cols, rows);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      setStatus("connecting");

      ws.onopen = () => setStatus("connected");
      ws.onclose = () => setStatus("disconnected");
      ws.onerror = () => setStatus("error");

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "ready") {
            setActiveSessionId(msg.sessionId);
            if (msg.buffer) term.write(msg.buffer);
            loadSessions();
          } else if (msg.type === "data") {
            term.write(msg.data);
          } else if (msg.type === "exit") {
            term.writeln(`\r\n\x1b[90m[process exited: ${msg.code}]\x1b[0m`);
            setStatus("exited");
          }
        } catch {
          term.write(String(ev.data));
        }
      };

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          // Local history for arrow keys when using fallback shells
          if (data === "\r") {
            if (lineBuf.current.trim()) {
              historyRef.current.push(lineBuf.current.trim());
              if (historyRef.current.length > 100) historyRef.current.shift();
            }
            lineBuf.current = "";
            histIdx.current = -1;
          } else if (data === "\x7f") {
            lineBuf.current = lineBuf.current.slice(0, -1);
          } else if (data === "\x1b[A") {
            // up
            const hist = historyRef.current;
            if (!hist.length) return;
            if (histIdx.current < 0) histIdx.current = hist.length - 1;
            else histIdx.current = Math.max(0, histIdx.current - 1);
            return;
          } else if (!data.startsWith("\x1b")) {
            lineBuf.current += data;
          }
          ws.send(JSON.stringify({ type: "input", data }));
        }
      });

      const onResize = () => {
        try {
          fit.fit();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows })
            );
          }
        } catch {
          /* ignore */
        }
      };
      const ro = new ResizeObserver(onResize);
      ro.observe(hostRef.current);

      return () => {
        ro.disconnect();
        ws.close();
        term.dispose();
      };
    },
    [projectId, loadSessions]
  );

  useEffect(() => {
    if (!active || !projectId) return undefined;
    return connect(activeSessionId);
  }, [active, projectId, activeSessionId, connect]);

  const addSession = async () => {
    if (!projectId) return;
    const s = await projectApi.createTerminal(projectId, { name: "Terminal" });
    await loadSessions();
    setActiveSessionId(s.id);
  };

  const removeSession = async (id) => {
    await projectApi.deleteTerminal(projectId, id);
    const next = sessions.filter((s) => s.id !== id);
    setSessions(next);
    if (activeSessionId === id) {
      setActiveSessionId(next[0]?.id || null);
    }
  };

  if (!projectId) {
    return (
      <div className="h-full flex items-center justify-center text-slate-600 text-xs">
        Select a project to open a terminal
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-white/5 shrink-0">
        <Terminal size={11} className="text-[#F15B42]" />
        <div className="flex gap-0.5 flex-1 overflow-x-auto">
          {(sessions.length ? sessions : [{ id: null, name: "New" }]).map((s) => (
            <button
              key={s.id || "new"}
              onClick={() => s.id && setActiveSessionId(s.id)}
              className={`group flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                activeSessionId === s.id
                  ? "bg-white/10 text-white"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {s.name || "Terminal"}
              {s.id && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSession(s.id);
                  }}
                  className="opacity-0 group-hover:opacity-100"
                >
                  <X size={10} />
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={addSession}
          className="p-1 text-slate-500 hover:text-white"
          title="New terminal"
        >
          <Plus size={12} />
        </button>
        <span
          className={`text-[9px] uppercase font-bold ${
            status === "connected"
              ? "text-emerald-400"
              : status === "error"
                ? "text-red-400"
                : "text-slate-600"
          }`}
        >
          {status}
        </span>
      </div>
      <div ref={hostRef} className="flex-1 min-h-0 px-1 py-1" />
    </div>
  );
}
