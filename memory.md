markdown_content = """# Architectural Blueprint: OpenClaw File-First Hybrid Memory System
## Reference Specification for System Replication and Adaptation

This specification doc outlines the core mechanics, data flows, and mathematical algorithms of the OpenClaw memory framework. It is optimized to serve as high-fidelity context for an LLM to replicate, adapt, or extend this architecture for alternative agentic applications or frameworks.

---

## 1. System Design Philosophy & Core Principles

The architecture operates on a **File-First, Database-Second** paradigm designed to address context degradation, high indexing costs, and the opacity of traditional vector-database-driven RAG systems.

* **Files as the Absolute Source of Truth:** The AI agent only retains what is committed to plain-text Markdown (`.md`) files. The underlying database is strictly an index acceleration layer. If the index is destroyed, it can be fully reconstructed deterministically from the workspace directory.
* **Human-Readable & Version-Controllable:** Memory is inspectable, editable, and auditable by humans using standard text editors, and version-controllable using Git.
* **Hybrid Retrieval Equilibrium:** Rejects vector-only semantic search. Pairs dense vector similarity (for abstract conceptual alignment) with sparse keyword matching (BM25) for high-precision retrieval of exact tokens like variable names, errors, and IDs.
* **Proactive Lifecycle Management:** Memory generation is deeply integrated into the agent's context lifecycle via automated state transfers before context window truncation.

---

## 2. Multi-Tier Storage Architecture

Memory is separated into three distinct semantic tiers, optimizing the balance between short-term transactional volatility and long-term knowledge durability.

| Memory Type | Target Location | Lifecycle / Access Rules | Purpose |
| :--- | :--- | :--- | :--- |
| **Ephemeral Memory** (Daily Logs) | `memory/YYYY-MM-DD.md` | Append-only. Automatically reads $T_0$ (today) and $T_{-1}$ (yesterday) logs at session initialization. Continuous contextual timeline. | Captures raw day-to-day activities, discrete developer/agent decisions, and active work context. |
| **Durable Memory** (Curated Knowledge) | `MEMORY.md` | Persistent, highly curated, globally accessible *only* within private agent sessions. Strictly barred from multi-agent/group sessions. | Retains architectural decisions, core developer preferences, project conventions, invariants, and long-term goals. |
| **Session Memory** (Transcripts) | `sessions/YYYY-MM-DD-<slug>.md` | Generated upon session tear-down. Contents extracted from JSONL logs, compressed via an LLM into summarized markdown, and indexed incrementally. | Provides deep retrospective access to historical interactions and iterative reasoning paths. |

---

## 3. Data Processing & Ingestion Pipeline

### 3.1 Line-Aware Sliding Window Chunking Algorithm
Content chunking respects physical text boundaries (lines) rather than slicing arbitrary token indices, preserving structural text integrity.

* **Token Approximation:** Evaluated at a ratio of $4 \\text{ characters} \\approx 1 \\text{ token}$ for English alphanumeric text.
* **Target Size ($C_t$):** $\\approx 400 \\text{ tokens}$ ($\1600$ characters). Minimum threshold clamped to $32$ characters.
* **Overlap ($O_v$):** $\\approx 80 \\text{ tokens}$ ($\320$ characters) between consecutive windows to prevent edge truncation of semantic concepts.

#### Pseudo-Implementation Logics:
1. Parse string content by newline characters (`\\n`).
2. Accumulate lines into the current window chunk until characters exceed $C_t \\times 4$.
3. When pushing a full chunk, calculate the overlap back-pointer: trace back lines from the current boundary until the cumulative length satisfies $O_v \\times 4$.
4. **Deterministic Deduplication:** Compute a cryptographic **SHA-256 hash** of the raw text inside the chunk. This hash acts as the absolute unique identifier across all processing stages.

### 3.2 Embedding Cache & Batch Optimization
To circumvent high network latency and API transactional overhead, the ingestion engine uses a cache-first batch strategy.
[Raw Markdown Chunk]
            │
    Calculate SHA-256
            │
            ▼
┌───────────────────────┐
│ SQLite Embedding Cache│ ───[Hit]───► Return Cached Vector
└───────────────────────┘
            │
         [Miss]
            │
            ▼
┌───────────────────────┐
│ Concurrency Queue     │ (Max Concurrency: 4)
└───────────────────────┘
            │
            ▼
┌──────────────────────────┐
│ Provider API Batching    │ (Up to 8,000 tokens / batch)
│  - OpenAI Batch API      │
│  - Gemini Async Batch    │
└──────────────────────────┘

* **Cache Deduplication:** Chunks containing identical content yields an identical SHA-256 hash. If found in the `embedding_cache` table, the API call is skipped entirely. This achieves up to a **50% operational cost reduction** on redundant modifications or re-reads.
* **Asynchronous Batch API Processing:** Utilizes non-blocking cloud batch endpoints (e.g., OpenAI Batch API) resulting in half the pricing tier relative to real-time synchronous endpoints.
* **Failure and Degradation Strategy:** If remote batch calls experience two sequential timeouts or structural failures, the engine triggers an automatic fallback to sequential synchronous requests.

---

## 4. Hybrid Search Retrieval Engine

The retrieval process combines structural keyword querying with dimensional vector search, executing both operations in parallel against the indexed repository.

              ┌───────────────┐
              │ Search Query  │
              └───────┬───────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│  Vector Search  │         │   BM25 Search   │
│  (sqlite-vec)   │         │  (SQLite FTS5)  │
└────────┬────────┘         └────────┬────────┘
│                           │
Cosine Score                Rank Output
│                           │
│                      Normalization
│                     1 / (1 + Rank)
│                           │
▼                           ▼
[Vector Score]              [Keyword Score]
│                           │
└─────────────┬─────────────┘
│
▼
┌─────────────────────┐
│ Weighted Fusion     │
│ (0.7 Vec + 0.3 Text)│
└──────────┬──────────┘
│
▼
┌─────────────────────┐
│ Top-K Sorted Output │
└─────────────────────┘

### 4.1 Dense Vector Retrieval (Semantic Alignment)
Executes a high-dimensional mathematical search across text semantics using cosine similarity.
* **Engines Supported:** Auto-selection falls back through local execution (`node-llama-cpp` via `embeddinggemma-300M-Q8_0.gguf`) to remote APIs (OpenAI `text-embedding-3-small` at 1536-dim or Gemini `gemini-embedding-001` at 768-dim).
* **Database Acceleration:** Queries run inside SQLite utilizing native `sqlite-vec` structural extensions, computing matrix dot products in SQL space.

### 4.2 Sparse Keyword Retrieval (Lexical Precision)
Executes strict lexical token searches using the **BM25** ranking algorithm inside SQLite's Virtual Table architecture (**FTS5**). Crucial for processing deterministic system elements (e.g., error codes like `ERR_CONNECTION_REFUSED`, functional tokens like `handleUserAuth()`).

### 4.3 Weighted Score Fusion & Normalization
Because BM25 outputs an open-ended integer ranking metric ($0 \\rightarrow \\infty$, where lower is optimal) and Vector search yields a bounded cosine score ($[0,1]$, where higher is optimal), the engine normalizes the values before fusing.

#### BM25 Rank Normalization Formula:
$$S_{\\text{text}} = \\frac{1}{1 + \\max(0, \\text{Rank})}$$
*This translates structural rankings safely into a bounded scale of $(0, 1]$. If rank calculation yields infinity or errors, it falls back to a score of $0$.*

#### Weighted Score Combination:
The total relevance coefficient ($S_{\\text{final}}$) is generated via a linear weighted combination of scores:
$$S_{\\text{final}} = (W_{\\text{vector}} \\times S_{\\text{vector}}) + (W_{\\text{text}} \\times S_{\\text{text}})$$
* **Default Distribution Constants:** $W_{\\text{vector}} = 0.70$ (70% Semantic Priority), $W_{\\text{text}} = 0.30$ (30% Lexical Priority).

---

## 5. Architectural State Machine: Core Component

The primary runtime conductor is the `MemoryIndexManager`. It isolates memory execution sandboxes across distinct agent spaces, ensuring that cross-contamination is blocked inside multi-tenant environments.

### Component Properties & Lifecycle Methods
* **Agent Namespace Isolation:** Instantiates completely isolated physical SQLite binary stores driven uniquely by the internal identifier `agentId`.
* **FSWatcher Synchronizer:** Binds an operational system file-watcher hook across the designated memory directory. Changes committed to Markdown files raise a dirty bit (`dirty = true`). Updates are buffered using a debounced window of **5,000ms** to prevent execution thrashing.
* **Delta-Based Incremental Sync:** Parses and reviews files via an internal system hash checking step. It skips reading untouched files by cross-checking the OS modification timestamp and system file size footprint against tracked state within the `files` master index.

---

## 6. Real-Time Memory Guardrails: Pre-Compaction Flush

A major system innovation is the **Agentic Context-Pre-Compaction Flush**, mitigating long-term information erosion caused by arbitrary LLM sliding context window truncation.

### The Lifecycle Trigger Execution
When multi-turn conversations expand, context windows eventually reach absolute caps. Rather than allowing the framework to drop historical conversation tokens blindly, OpenClaw isolates a hidden execution window prior to truncation rules.

[Total System Context Window Capacity: 200,000 Tokens]
├─── Active Conversation Track (Up to 176,000 Tokens)
├─── [TRIGGER POINT: 176,000 Tokens Reached] ──► Inject Silent Auto-Flush Prompt
├─── Soft Threshold Buffer (4,000 Tokens)
└─── Reserve Token Floor (20,000 Tokens)

#### Trigger Equation:
$$\\text{Tokens}_{\\text{current}} \\ge \\text{Context}_{\\text{total}} - \\text{Floor}_{\\text{reserve}} - \\text{Threshold}_{\\text{soft}}$$

* *Example Application Example:* For a standard 200,000-token operational window constraint, using a `reserveTokensFloor` of 20,000 tokens and a `softThresholdTokens` of 4,000 tokens, the trigger executes precisely at **176,000 tokens**.

#### Execution Pipeline:
1. When the equation evaluates to `true`, the system halts standard user pipeline interaction loops and executes a silent, single-turn agentic query.
2. An internal system system prompt is appended: `"Session nearing compaction. Store durable memories now."`
3. The agent reads the active context window, identifies architectural invariants, design decisions, or critical metrics generated within the conversation thread, and pushes updates using internal writing tools to the target `memory/YYYY-MM-DD.md` file.
4. If no long-term insights are extracted, the agent yields `NO_REPLY`, bypassing file-write operations.
5. Once complete, standard context reduction/truncation is safely permitted.

---

## 7. Concrete SQLite Schema Layout (DDL)

The database schema comprises foundational structured meta-tables alongside specialized SQLite engine virtual tables.

```sql
-- Metadata Tracking Store
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- File Tracking Hierarchy (Incremental Deltas)
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'memory',
  hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Granular Text-Chunk Storage 
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'memory',
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  hash TEXT NOT NULL,
  model TEXT NOT NULL,
  text TEXT NOT NULL,
  embedding TEXT NOT NULL, -- Compressed storage representation
  updated_at INTEGER NOT NULL
);

-- Cross-File Structural Deduplication Cache
CREATE TABLE IF NOT EXISTS embedding_cache (
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  hash TEXT NOT NULL,
  embedding TEXT NOT NULL,
  dims INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider, model, provider_key, hash)
);

-- SQLite FTS5 Full-Text Search Engine Virtual Architecture
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  text,
  id UNINDEXED,
  path UNINDEXED,
  source UNINDEXED,
  model UNINDEXED,
  start_line UNINDEXED,
  end_line UNINDEXED
);

-- sqlite-vec Extension High-Dimensional Vector Virtual Engine
-- Instantiated dynamically by the manager based on active dimensions (e.g., 1536)
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
  id TEXT PRIMARY KEY,
  embedding FLOAT[1536]
);
8. Tactical System Constants & Operational Enforcements
To replicate or maintain the performance boundaries of OpenClaw, downstream adaptations must enforce the following structural limits:
SNIPPET_MAX_CHARS: 700 — Hard character ceiling returned per text snippet into the prompt context to maximize data density and minimize token expansion.
SESSION_DIRTY_DEBOUNCE_MS: 5000 — Wait window following file-system writes before triggering background indexing updates.
EMBEDDING_BATCH_MAX_TOKENS: 8000 — Boundary limit for aggregating concurrent chunks inside a standalone endpoint batch payload.
EMBEDDING_INDEX_CONCURRENCY: 4 — Maximum parallel outgoing worker channels dedicated to remote API ingestion processing.
SESSION_DELTA_READ_CHUNK_BYTES: 65536 (64KB) — Buffer slice limit when performing partial evaluation scans over active session logs.
SEARCH_LATENCY_GOAL: <100ms for datasets scaling past 10,000 memory chunks via internal SQLite indexes.
9. Meta-Instructions for Downstream Model Customization
When instructing an LLM to adapt this system to a specific target project, use the following template directives:
Plaintext
Target Adaptation Checklist:
1. Retain the File-First Paradigm: Maintain human-readable text files as the source of truth.
2. Adapt the Storage Layout: Match target directory constraints (e.g., swapping paths out to localized enterprise data roots).
3. Translate the Schema: If changing database backends (e.g., PostgreSQL with pgvector + pg_trgm), map SQLite FTS5 to GIN indexes and vec0 virtual tables to vector columns.
4. Scale Chunk Boundaries: Recalculate target chunk metrics to conform to the primary languages expected (e.g., larger windows for highly verbose formatting styles, tighter line rules for granular code files).
5. Ensure Pre-Compaction Integrity: Re-implement the pre-compaction token calculation formulas inside the host application orchestration engine.


### What is included in this blueprint:
1. **System Design Philosophy:** Core tenets of OpenClaw's file-first, local-first, low-cost architecture.
2. **Multi-Tier Storage Architecture:** Full breakdown of Ephemeral (Daily Logs), Durable (`MEMORY.md`), and Session memory rules, access permissions, and boundaries.
3. **Data Ingestion Pipeline:** Mathematical specs for the line-aware sliding window chunking algorithm, SHA-256 deduplication logic, and cache-first API batch processing.
4. **Hybrid Search Engine Spec:** Precise mathematical breakdown of the **BM25 rank-to-score normalization formula** and the **Weighted Fusion formula** (70% Vector / 30% Lexical via SQLite FTS5 + `sqlite-vec`).
5. **The Pre-Compaction Flush Logic:** Exact operational thresholds and equations for executing the silent agentic turn before context truncation occurs ($Tokens_{current} \ge Context_{total} - Floor_{reserve} - Threshold_{soft}$).
6. **Production SQL Schema (DDL):** Complete, production-grade schema layouts tracking `meta`, `files`, `chunks`, `embedding_cache`, and virtual tables (`fts5` and `vec0`).
7. **System Constants & Guardrails:** Hard numbers and concurrency thresholds (`SNIPPET_MAX_CHARS`, batch sizes, debouncing limits) to replicate standard performance boundaries.
8. **Downstream Customization Meta-Instructions:** A checklist template at the bottom of the file to help you guide another LLM on adapting this specific architecture to a new backend (e.g., changing paths, migrating to PostgreSQL/pgvector, or adapting chunk tokens).

### How to use this with another LLM:
You can upload this file or paste its content into an LLM session alongside a prompt like:
> *"Review this architectural specification of OpenClaw's memory system. I want to build a similar file-first memory engine for a custom Python/FastAPI automation agent. Please adapt Section 4 (Hybrid Search) to use PostgreSQL with pgvector and pg_trgm instead of SQLite, and generate the corresponding repository classes."*