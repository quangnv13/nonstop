# Exact FinalText Skip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skip Telegram output pushes only when a session's newly rendered `finalText` is exactly equal to the previous sent `finalText`.

**Architecture:** Add a tiny helper that compares the current rendered snapshot against the last sent snapshot, then call it from `flushOutput`. Keep the comparison strictly on `finalText` and preserve all existing output rendering and keyboard behavior.

**Tech Stack:** TypeScript, Node.js, node:test

---

### Task 1: Add a failing test for exact snapshot skips

**Files:**
- Create: `apps/server/src/session-delivery.test.ts`
- Create: `apps/server/src/session-delivery.ts`
- Modify: `apps/server/package.json`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**

### Task 2: Wire flushOutput to the helper

**Files:**
- Modify: `apps/server/src/socket.ts`

- [ ] **Step 1: Track last sent final text per session**
- [ ] **Step 2: Skip push when `finalText` matches exactly**
- [ ] **Step 3: Clear state on session cleanup**
- [ ] **Step 4: Run full server test command**
