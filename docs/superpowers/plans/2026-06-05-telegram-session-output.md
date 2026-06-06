# Telegram Session Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove CLI output skip filtering, push the current session snapshot to Telegram every 20 seconds, and attach a 3-column session action keyboard to every session output message.

**Architecture:** Keep terminal snapshot rendering in the server socket layer, but remove duplicate/spinner threshold decisions from the Telegram push path. Extract a focused helper for session action keyboards so both the bot UI and automatic output pushes can reuse the same callback layout.

**Tech Stack:** TypeScript, Node.js, Socket.IO, Grammy, node:test

---

### Task 1: Add failing tests for reusable session action keyboards

**Files:**
- Create: `apps/server/src/session-controls.test.ts`
- Create: `apps/server/src/session-controls.ts`
- Modify: `apps/server/package.json`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

### Task 2: Add failing tests for always-sent session snapshots

**Files:**
- Create: `apps/server/src/session-output.test.ts`
- Create: `apps/server/src/session-output.ts`
- Modify: `apps/server/src/socket.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

### Task 3: Wire bot and socket integration

**Files:**
- Modify: `apps/server/src/bot.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/src/socket.ts`

- [ ] **Step 1: Reuse the new keyboard helper in manual session views and output pushes**
- [ ] **Step 2: Replace Ctrl+C button with Interrupt button that sends ESC**
- [ ] **Step 3: Keep confirmation prompt buttons but align interrupt behavior**
- [ ] **Step 4: Run targeted tests and full server test command**

### Task 4: Update runtime config

**Files:**
- Modify: `apps/server/.env`
- Modify: `apps/server/src/output-filter.test.ts`
- Modify: `apps/server/src/output-filter.ts`

- [ ] **Step 1: Remove obsolete threshold/spinner env usage from code paths under change**
- [ ] **Step 2: Set `OUTPUT_INTERVAL=20000` and `MAX_OUTPUT_LINES=50`**
- [ ] **Step 3: Run verification and confirm clean build**
