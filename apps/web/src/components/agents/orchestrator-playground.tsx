"use client";

import { useState, useEffect } from "react";
import {
  Bot,
  Sparkles,
  CreditCard,
  Wrench,
  Database,
  Send,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  QrCode,
  ShieldAlert,
  ArrowRight,
  Code2,
  Search,
} from "lucide-react";

type Tab = "journey" | "qris" | "tools" | "rag";

export function OrchestratorPlayground() {
  const [activeTab, setActiveTab] = useState<Tab>("journey");

  // Chat / Journey State
  const [threadId, setThreadId] = useState("discord-session-001");
  const [customerName, setCustomerName] = useState("Raffi_Roblox");
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    {
      role: "assistant",
      content:
        "Halo @Raffi_Roblox! Saya Lexi, AI Ops Assistant studio ini. Mau pesan aset Roblox 3D apa hari ini? (Misal: UGC Hat, Aksesoris, Sayap Neon, atau Game Prop)",
    },
  ]);
  const [stage, setStage] = useState("intake");
  const [latestSpec, setLatestSpec] = useState<any>(null);
  const [latestPayment, setLatestPayment] = useState<any>(null);
  const [designerTask, setDesignerTask] = useState<any>(null);
  const [revisionNotes, setRevisionNotes] = useState<any>(null);
  const [socialPost, setSocialPost] = useState<any>(null);

  // QRIS State
  const [qrisAmount, setQrisAmount] = useState(250000);
  const [qrisDesc, setQrisDesc] = useState("Cyber Valkyrie Wings UGC");
  const [qrisInvoice, setQrisInvoice] = useState<any>(null);
  const [qrisLoading, setQrisLoading] = useState(false);
  const [qrisPaidStatus, setQrisPaidStatus] = useState<string | null>(null);

  // Dynamic Tools State
  const [tools, setTools] = useState<any[]>([]);
  const [newToolName, setNewToolName] = useState("calculate_discount");
  const [newToolDesc, setNewToolDesc] = useState("Hitung diskon 10% untuk pelanggan tetap");
  const [newToolCode, setNewToolCode] = useState(
    "def calculate_discount(amount, percent=10):\n    discount = int(amount * (percent / 100))\n    return {'original': amount, 'discount': discount, 'final_price': amount - discount}",
  );
  const [toolResult, setToolResult] = useState<any>(null);
  const [toolError, setToolError] = useState<string | null>(null);

  // RAG Search State
  const [ragQuery, setRagQuery] = useState("Berapa limit triangle untuk aksesoris Roblox UGC?");
  const [ragResults, setRagResults] = useState<any[]>([]);
  const [ragLoading, setRagLoading] = useState(false);

  // Load tools on mount
  useEffect(() => {
    fetchTools();
  }, []);

  const fetchTools = async () => {
    try {
      const res = await fetch("/api/orchestrator/tools");
      if (res.ok) {
        const data = await res.json();
        setTools(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || chatInput;
    if (!text.trim() || chatLoading) return;

    const userMsg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch("/api/orchestrator/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          customer_name: customerName,
          message: text,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
        setStage(data.stage);
        if (data.commission_spec) setLatestSpec(data.commission_spec);
        if (data.payment_data) setLatestPayment(data.payment_data);
        if (data.designer_task) setDesignerTask(data.designer_task);
        if (data.revision_notes) setRevisionNotes(data.revision_notes);
        if (data.social_post) setSocialPost(data.social_post);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `[Error: ${data.detail || data.error}]` },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `[Connection Error: ${err.message}]` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleGenerateQRIS = async () => {
    setQrisLoading(true);
    setQrisPaidStatus(null);
    try {
      const res = await fetch("/api/orchestrator/qris/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: customerName,
          amount_idr: qrisAmount,
          description: qrisDesc,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setQrisInvoice(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setQrisLoading(false);
    }
  };

  const handleSimulatePayment = async () => {
    if (!qrisInvoice?.invoice_id) return;
    try {
      const res = await fetch("/api/orchestrator/qris/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: qrisInvoice.invoice_id }),
      });
      const data = await res.json();
      if (res.ok) {
        setQrisPaidStatus("LUNAS (Verified via QRIS Realtime Hook)");
        setQrisInvoice(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateTool = async () => {
    setToolResult(null);
    setToolError(null);
    try {
      const res = await fetch("/api/orchestrator/tools/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newToolName,
          description: newToolDesc,
          python_code: newToolCode,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setToolResult(data.tool);
        fetchTools();
      } else {
        setToolError(data.detail || "Gagal membuat tool");
      }
    } catch (e: any) {
      setToolError(e.message);
    }
  };

  const handleRagSearch = async () => {
    if (!ragQuery.trim()) return;
    setRagLoading(true);
    try {
      const res = await fetch("/api/orchestrator/memory/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: ragQuery, top_k: 3 }),
      });
      const data = await res.json();
      if (res.ok) {
        setRagResults(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRagLoading(false);
    }
  };

  return (
    <div className="panel mt-6 flex flex-col overflow-hidden border border-brand/30 bg-surface-1 shadow-lg">
      {/* Header Banner */}
      <div className="flex flex-col gap-3 border-b border-line bg-surface-2/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/20 text-brand">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[16px] font-bold text-ink">
                Autonomous Multi-Agent Orchestrator
              </h2>
              <span className="rounded bg-brand/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-brand">
                LANGGRAPH + PERSISTENT MEMORY
              </span>
            </div>
            <p className="text-[12px] text-ink-muted">
              Zero Non-Creative Work for Designers — Robot melayani customer Discord, verifikasi QRIS, & siapkan technical brief.
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-1 rounded-md bg-surface-1 p-1">
          <button
            onClick={() => setActiveTab("journey")}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-medium transition-colors ${
              activeTab === "journey"
                ? "bg-brand text-canvas font-semibold shadow-sm"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            <Bot className="h-3.5 w-3.5" />
            Customer Journey
          </button>
          <button
            onClick={() => setActiveTab("qris")}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-medium transition-colors ${
              activeTab === "qris"
                ? "bg-brand text-canvas font-semibold shadow-sm"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" />
            QRIS Gateway
          </button>
          <button
            onClick={() => setActiveTab("tools")}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-medium transition-colors ${
              activeTab === "tools"
                ? "bg-brand text-canvas font-semibold shadow-sm"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            <Wrench className="h-3.5 w-3.5" />
            Dynamic Self-Tooling
          </button>
          <button
            onClick={() => setActiveTab("rag")}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-medium transition-colors ${
              activeTab === "rag"
                ? "bg-brand text-canvas font-semibold shadow-sm"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            Vector RAG & Specs
          </button>
        </div>
      </div>

      {/* Tab 1: Customer Journey & Memory Playground */}
      {activeTab === "journey" && (
        <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-12">
          {/* Chat Window (7 Cols) */}
          <div className="flex flex-col rounded-lg border border-line bg-canvas lg:col-span-7">
            <div className="flex items-center justify-between border-b border-line bg-surface-2/40 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-[12px] font-semibold text-ink">
                  Discord Session: #{threadId}
                </span>
                <span className="rounded bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-ink-muted">
                  Stage: {stage}
                </span>
              </div>
              <button
                onClick={() => {
                  setThreadId(`session-${Date.now().toString().slice(-4)}`);
                  setMessages([
                    {
                      role: "assistant",
                      content:
                        "Sesi baru dimulai! Halo @Raffi_Roblox! Ada yang bisa saya bantu buat aset Roblox Anda?",
                    },
                  ]);
                  setStage("intake");
                  setLatestSpec(null);
                  setLatestPayment(null);
                  setDesignerTask(null);
                }}
                className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink"
              >
                <RefreshCw className="h-3 w-3" /> Reset Sesi
              </button>
            </div>

            {/* Quick Demo Starters */}
            <div className="flex flex-wrap gap-1.5 border-b border-line bg-surface-1/50 p-2.5">
              <span className="text-[11px] text-ink-dim self-center mr-1">Coba cepat:</span>
              <button
                onClick={() =>
                  handleSendMessage(
                    "Halo min, saya mau pesan 3D Cyber Wings aksesoris Roblox UGC, budget 250rb",
                  )
                }
                className="rounded border border-line bg-surface-2 px-2 py-1 text-[11px] text-ink hover:border-brand"
              >
                1. Order Sayap UGC
              </button>
              <button
                onClick={() =>
                  handleSendMessage(
                    "Saya setuju dengan rincian itu min, tolong buatkan invoice QRIS pembayarannya",
                  )
                }
                className="rounded border border-line bg-surface-2 px-2 py-1 text-[11px] text-ink hover:border-brand"
              >
                2. Setujui & Bayar QRIS
              </button>
              <button
                onClick={() =>
                  handleSendMessage(
                    "Min, tolong sayapnya diubah warnanya jadi ungu neon dan ukurannya dibuat lebih lebar",
                  )
                }
                className="rounded border border-line bg-surface-2 px-2 py-1 text-[11px] text-ink hover:border-brand"
              >
                3. Kirim Revisi Model
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex h-[360px] flex-col gap-3 overflow-y-auto p-4">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${
                    m.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div className="flex items-center gap-1.5 pb-1">
                    <span className="font-mono text-[10px] text-ink-dim">
                      {m.role === "user" ? `@${customerName}` : "🤖 Lexi (Studio Ops AI)"}
                    </span>
                  </div>
                  <div
                    className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-brand text-canvas font-medium rounded-tr-none"
                        : "border border-line bg-surface-2 text-ink rounded-tl-none"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex items-center gap-2 text-[12px] text-ink-muted">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-brand" />
                  <span>Agent sedang berpikir & memvalidasi spek...</span>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <div className="flex gap-2 border-t border-line p-3">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder="Ketik pesan customer ke Discord bot..."
                className="flex-1 rounded border border-line bg-surface-1 px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={chatLoading || !chatInput.trim()}
                className="flex items-center gap-1.5 rounded bg-brand px-4 py-2 text-[13px] font-semibold text-canvas transition-opacity disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                Kirim
              </button>
            </div>
          </div>

          {/* Designer Autonomous Output Shield (5 Cols) */}
          <div className="flex flex-col gap-4 lg:col-span-5">
            {/* Live Orchestrator Card */}
            <div className="rounded-lg border border-line bg-surface-2 p-4">
              <div className="flex items-center justify-between pb-2 border-b border-line">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-brand">
                  Hasil Otomasi Untuk Desainer
                </span>
                <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-[9px] font-semibold text-emerald-400">
                  Desainer Bebas Beban Admin
                </span>
              </div>

              {designerTask ? (
                <div className="mt-3 space-y-2">
                  <div className="rounded border border-brand/40 bg-surface-1 p-3">
                    <p className="font-mono text-[10px] text-brand uppercase">Task Card Blender:</p>
                    <h4 className="font-bold text-[14px] text-ink">{designerTask.title}</h4>
                    <p className="text-[12px] text-ink-muted mt-1">{designerTask.description}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-mono">
                      <div className="rounded bg-surface-2 p-1.5">
                        <span className="text-ink-dim block">Max Triangles:</span>
                        <span className="text-ink font-semibold">{designerTask.max_triangles} tris</span>
                      </div>
                      <div className="rounded bg-surface-2 p-1.5">
                        <span className="text-ink-dim block">Texture Size:</span>
                        <span className="text-ink font-semibold">{designerTask.texture_size}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-[12px] text-ink-dim">
                  Belum ada task card. Coba kirim pesanan di chat untuk memicu intake & task creation!
                </div>
              )}

              {/* Revision Card */}
              {revisionNotes && (
                <div className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 p-3">
                  <p className="font-mono text-[10px] text-amber-400 uppercase font-semibold">
                    Filter Revisi Teknis:
                  </p>
                  <p className="text-[12px] text-ink mt-1">{revisionNotes.actionable_checklist}</p>
                </div>
              )}

              {/* Social Media Showcase */}
              {socialPost && (
                <div className="mt-3 rounded border border-blue-500/40 bg-blue-500/10 p-3">
                  <p className="font-mono text-[10px] text-blue-400 uppercase font-semibold">
                    Auto-Post Showcase Portfolio:
                  </p>
                  <p className="text-[12px] text-ink mt-1 font-mono">{socialPost.caption}</p>
                </div>
              )}
            </div>

            {/* Persistent Memory Status */}
            <div className="rounded-lg border border-line bg-surface-1 p-4 text-[12px]">
              <div className="flex items-center gap-2 text-ink font-semibold">
                <Database className="h-4 w-4 text-brand" />
                <span>LangGraph Two-Layer Memory</span>
              </div>
              <ul className="mt-2 space-y-1.5 text-ink-muted">
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Short-Term Working Memory:</strong> Checkpointer keyed by{" "}
                    <code className="text-brand font-mono">discord:{threadId}</code> menjaga konteks dialog 100% konsisten.
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Long-Term Vector Memory (RAG):</strong> Grounding batasan poly Roblox UGC & kebijakan studio langsung dari vector store.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: QRIS Gateway Simulator */}
      {activeTab === "qris" && (
        <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <h3 className="text-[15px] font-bold text-ink">Indonesian Dynamic QRIS Generator</h3>
              <p className="text-[12px] text-ink-muted">
                Sistem menghasilkan string QRIS standar EMVCo resmi dengan kalkulasi CRC16 otomatis untuk BCA, Mandiri, Gopay, OVO, Dana.
              </p>
            </div>

            <div className="space-y-3 rounded-lg border border-line bg-surface-2 p-4">
              <div>
                <label className="text-[12px] font-medium text-ink">Nama Customer:</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="mt-1 w-full rounded border border-line bg-surface-1 px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="text-[12px] font-medium text-ink">Deskripsi Item Aset:</label>
                <input
                  type="text"
                  value={qrisDesc}
                  onChange={(e) => setQrisDesc(e.target.value)}
                  className="mt-1 w-full rounded border border-line bg-surface-1 px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="text-[12px] font-medium text-ink">Nominal Pembayaran (IDR):</label>
                <input
                  type="number"
                  value={qrisAmount}
                  onChange={(e) => setQrisAmount(Number(e.target.value))}
                  className="mt-1 w-full rounded border border-line bg-surface-1 px-3 py-2 text-[13px] text-ink outline-none focus:border-brand"
                />
              </div>

              <button
                onClick={handleGenerateQRIS}
                disabled={qrisLoading}
                className="w-full flex items-center justify-center gap-2 rounded bg-brand py-2.5 text-[13px] font-semibold text-canvas transition-colors hover:bg-brand/90"
              >
                {qrisLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                Generate Dynamic QRIS Invoice
              </button>
            </div>
          </div>

          {/* QR Code Output */}
          <div className="flex flex-col items-center justify-center rounded-lg border border-line bg-surface-2 p-6 text-center">
            {qrisInvoice ? (
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-lg bg-white p-3 shadow-md">
                  {qrisInvoice.qr_base64 ? (
                    <img
                      src={qrisInvoice.qr_base64}
                      alt="QRIS Code"
                      className="h-48 w-48 object-contain"
                    />
                  ) : (
                    <div className="h-48 w-48 flex items-center justify-center text-zinc-400">
                      QR Generated
                    </div>
                  )}
                </div>

                <div className="text-center">
                  <span className="font-mono text-[12px] font-bold text-ink">
                    Invoice: {qrisInvoice.invoice_id}
                  </span>
                  <div className="text-[18px] font-extrabold text-brand mt-0.5">
                    {qrisInvoice.amount_formatted}
                  </div>
                  <p className="text-[11px] text-ink-muted">EMVCo Checksum Validated</p>
                </div>

                {qrisPaidStatus ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 font-mono text-[11px] font-bold text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {qrisPaidStatus}
                  </div>
                ) : (
                  <button
                    onClick={handleSimulatePayment}
                    className="flex items-center gap-2 rounded border border-emerald-500 bg-emerald-500/10 px-4 py-2 font-mono text-[12px] font-semibold text-emerald-400 hover:bg-emerald-500/20"
                  >
                    Simulasi Customer Scan &amp; Bayar
                  </button>
                )}
              </div>
            ) : (
              <div className="text-ink-dim">
                <QrCode className="mx-auto h-16 w-16 opacity-30 mb-2" />
                <p className="text-[13px]">Klik tombol Generate untuk membuat invoice QRIS instan.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Dynamic Self-Tooling Console */}
      {activeTab === "tools" && (
        <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-12">
          {/* Active Tools List (5 Cols) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-ink">Active Tool Registry</h3>
              <span className="rounded bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-ink-muted">
                {tools.length} Tools
              </span>
            </div>

            <div className="space-y-2 max-h-[420px] overflow-y-auto">
              {tools.map((t) => (
                <div key={t.name} className="rounded border border-line bg-surface-2 p-3 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-brand">{t.name}()</span>
                    <span className="rounded bg-surface-1 px-1.5 py-0.5 text-[9px] text-ink-dim font-mono">
                      {t.author}
                    </span>
                  </div>
                  <p className="text-ink-muted text-[11px] mt-1">{t.description}</p>
                  <pre className="mt-2 rounded bg-canvas p-2 font-mono text-[10px] text-ink-muted overflow-x-auto">
                    {t.code}
                  </pre>
                </div>
              ))}
            </div>
          </div>

          {/* AST Safe Code Creator (7 Cols) */}
          <div className="lg:col-span-7 space-y-3">
            <div>
              <h3 className="text-[14px] font-bold text-ink">Autonomous Tool Creator (AST Sandbox)</h3>
              <p className="text-[11px] text-ink-muted">
                AI dapat memprogram fungsinya sendiri secara dinamis. Kode diverifikasi melalui Abstract Syntax Tree (AST) untuk mencegah import berbahaya (`os`, `sys`, `eval`).
              </p>
            </div>

            <div className="space-y-3 rounded-lg border border-line bg-surface-2 p-4">
              <div>
                <label className="text-[11px] font-mono text-ink">Nama Tool:</label>
                <input
                  type="text"
                  value={newToolName}
                  onChange={(e) => setNewToolName(e.target.value)}
                  className="mt-1 w-full rounded border border-line bg-surface-1 px-2.5 py-1.5 font-mono text-[12px] text-ink"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-ink">Deskripsi Fungsi:</label>
                <input
                  type="text"
                  value={newToolDesc}
                  onChange={(e) => setNewToolDesc(e.target.value)}
                  className="mt-1 w-full rounded border border-line bg-surface-1 px-2.5 py-1.5 text-[12px] text-ink"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-ink">Python Code (Pure logic):</label>
                <textarea
                  rows={5}
                  value={newToolCode}
                  onChange={(e) => setNewToolCode(e.target.value)}
                  className="mt-1 w-full rounded border border-line bg-canvas p-2.5 font-mono text-[11px] text-ink outline-none focus:border-brand"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCreateTool}
                  className="flex items-center gap-1.5 rounded bg-brand px-4 py-2 font-mono text-[12px] font-semibold text-canvas hover:bg-brand/90"
                >
                  <Code2 className="h-3.5 w-3.5" /> Register &amp; Validate AST
                </button>
                <button
                  onClick={() => {
                    setNewToolCode("import os\nos.system('dir')");
                  }}
                  className="flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 font-mono text-[11px] text-rose-400"
                >
                  <ShieldAlert className="h-3 w-3" /> Uji Coba Exploit (Harus Ditolak)
                </button>
              </div>

              {toolError && (
                <div className="rounded border border-rose-500/40 bg-rose-500/15 p-2.5 text-[12px] text-rose-300">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" /> AST Security Violation Blocked:
                  </div>
                  <p className="mt-0.5">{toolError}</p>
                </div>
              )}

              {toolResult && (
                <div className="rounded border border-emerald-500/40 bg-emerald-500/15 p-2.5 text-[12px] text-emerald-300">
                  <div className="font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> Tool Berhasil Diverifikasi &amp; Terdaftar!
                  </div>
                  <p className="font-mono text-[11px] mt-0.5">Siap dieksekusi oleh agent.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Vector RAG & Roblox Specs */}
      {activeTab === "rag" && (
        <div className="space-y-4 p-6">
          <div>
            <h3 className="text-[15px] font-bold text-ink">Roblox UGC Vector Memory (Semantic Search)</h3>
            <p className="text-[12px] text-ink-muted">
              Pencarian berbasis semantic embedding (cosine similarity) untuk pedoman resmi Roblox UGC &amp; kebijakan studio.
            </p>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRagSearch()}
              placeholder="Cari limit UGC, texture rules, hak cipta..."
              className="flex-1 rounded border border-line bg-surface-2 px-3.5 py-2 text-[13px] text-ink outline-none focus:border-brand"
            />
            <button
              onClick={handleRagSearch}
              disabled={ragLoading}
              className="flex items-center gap-1.5 rounded bg-brand px-4 py-2 text-[13px] font-semibold text-canvas"
            >
              <Search className="h-3.5 w-3.5" />
              {ragLoading ? "Mencari..." : "Search Vector Store"}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 pt-2">
            {ragResults.length > 0 ? (
              ragResults.map((r, i) => (
                <div key={i} className="rounded-lg border border-line bg-surface-2 p-4 text-[12px]">
                  <div className="flex items-center justify-between pb-2 border-b border-line">
                    <span className="rounded bg-brand/20 px-2 py-0.5 font-mono text-[10px] font-bold text-brand">
                      {r.metadata?.category || "Roblox UGC"}
                    </span>
                    <span className="font-mono text-[10px] text-emerald-400">
                      Score: {(r.similarity * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="mt-2 text-ink leading-relaxed">{r.content}</p>
                </div>
              ))
            ) : (
              <div className="col-span-3 py-8 text-center text-[12px] text-ink-dim">
                Ketik pertanyaan atau klik "Search Vector Store" untuk menguji pengambilan embedding RAG!
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
