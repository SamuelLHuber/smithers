import { describe, expect, test } from "bun:test";
import net from "node:net";
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, "../../..");
const ZMUXD = resolve(process.env.HOME ?? "", "zmux/zig-out/bin/zmuxd");
const describeIfZmux = existsSync(ZMUXD) ? describe : describe.skip;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const b64 = (s) => Buffer.from(s, "binary").toString("base64");
const KEY = { down: "\x1b[B", ctrlC: "\x03" };

describeIfZmux("smithers tui zmux PTY", () => {
    test("renders the workflow picker without wrapped ghost rows", async () => {
        const sockPath = `/tmp/zmx-smithers-tui-${Date.now().toString(36)}.sock`;
        const daemon = spawn(ZMUXD, ["--socket", sockPath, "--idle-seconds", "60"], {
            stdio: "ignore",
            env: process.env,
        });

        let rpcClient;
        let sessionId;
        try {
            for (let i = 0; i < 50 && !existsSync(sockPath); i += 1) {
                await sleep(100);
            }
            expect(existsSync(sockPath)).toBe(true);

            rpcClient = connectRpc(sockPath);
            await rpcClient.ready;
            await rpcClient.rpc("daemon.ping", {});

            const cols = 80;
            const rows = 20;
            const created = await rpcClient.rpc("session.create", {
                command: "bun apps/cli/src/index.js tui",
                cwd: REPO_ROOT,
                cols,
                rows,
            });
            sessionId = created.id;

            const capture = async () => (await rpcClient.rpc("session.capture", { sessionId, lines: 400 })).text;
            const send = (keys) => rpcClient.rpc("session.send", { sessionId, dataBase64: b64(keys) });

            let raw = "";
            for (let i = 0; i < 60; i += 1) {
                await sleep(250);
                raw = await capture();
                if (raw.includes("Select a workflow to run")) break;
            }
            const initialGrid = emulate(raw, cols, rows);

            for (let i = 0; i < 12; i += 1) {
                await send(KEY.down);
                await sleep(100);
            }
            const afterGrid = emulate(await capture(), cols, rows);

            await send(KEY.ctrlC).catch(() => {});
            await sleep(200);

            const initialActive = activeRows(initialGrid);
            const afterActive = activeRows(afterGrid);
            const initialLabel = activeLabel(initialGrid);
            const afterLabel = activeLabel(afterGrid);

            expect(initialGrid.some((line) => line.includes("Select a workflow to run"))).toBe(true);
            expect(initialActive).toHaveLength(1);
            expect(afterActive).toHaveLength(1);
            expect(afterGrid.every((line) => line.length <= cols)).toBe(true);
            expect(afterLabel.length).toBeGreaterThan(0);
            expect(afterLabel).not.toBe(initialLabel);
        } finally {
            if (rpcClient && sessionId) {
                await rpcClient.rpc("session.terminate", { sessionId }).catch(() => {});
            }
            if (rpcClient) {
                await rpcClient.rpc("daemon.shutdown", {}).catch(() => {});
                rpcClient.sock.end();
            }
            daemon.kill("SIGTERM");
            try {
                rmSync(sockPath, { force: true });
            } catch { }
        }
    }, 30_000);
});

function activeRows(grid) {
    return grid.filter((line) => line.includes("●"));
}

function activeLabel(grid) {
    return (activeRows(grid)[0] ?? "").replace(/[│●]/g, "").trim();
}

function connectRpc(path) {
    const sock = net.createConnection({ path });
    let buffer = "";
    let nextId = 1;
    const pending = new Map();
    sock.setEncoding("utf8");
    sock.on("data", (chunk) => {
        buffer += chunk;
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            if (!line.trim()) continue;
            let message;
            try {
                message = JSON.parse(line);
            } catch {
                continue;
            }
            if (message.id != null && pending.has(message.id)) {
                const entry = pending.get(message.id);
                pending.delete(message.id);
                if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
                else entry.resolve(message.result);
            }
        }
    });
    const ready = new Promise((resolveReady, rejectReady) => {
        sock.once("connect", resolveReady);
        sock.once("error", rejectReady);
    });
    return {
        sock,
        ready,
        rpc(method, params) {
            const id = nextId;
            nextId += 1;
            return new Promise((resolveRpc, rejectRpc) => {
                const timeout = setTimeout(() => {
                    if (!pending.has(id)) return;
                    pending.delete(id);
                    rejectRpc(new Error(`timeout: ${method}`));
                }, 5_000);
                pending.set(id, {
                    resolve(value) {
                        clearTimeout(timeout);
                        resolveRpc(value);
                    },
                    reject(error) {
                        clearTimeout(timeout);
                        rejectRpc(error);
                    },
                });
                sock.write(`${JSON.stringify({ id, method, params })}\n`);
            });
        },
    };
}

function emulate(bytes, cols = 80, rows = 20) {
    const grid = Array.from({ length: rows }, () => Array(cols).fill(" "));
    let row = 0;
    let col = 0;
    const scroll = () => {
        grid.shift();
        grid.push(Array(cols).fill(" "));
    };
    const clampRow = () => {
        while (row >= rows) {
            scroll();
            row -= 1;
        }
        if (row < 0) row = 0;
    };

    for (let i = 0; i < bytes.length;) {
        const ch = bytes[i];
        if (ch === "\x1b" && bytes[i + 1] === "[") {
            let j = i + 2;
            let params = "";
            while (j < bytes.length && /[0-9;?]/.test(bytes[j])) {
                params += bytes[j];
                j += 1;
            }
            const final = bytes[j];
            const privateSeq = params.startsWith("?");
            const nums = params.replace("?", "").split(";").map((value) => (value === "" ? undefined : Number.parseInt(value, 10)));
            const n = nums[0];
            if (!privateSeq) {
                if (final === "A") {
                    row -= n || 1;
                    clampRow();
                } else if (final === "B") {
                    row += n || 1;
                    clampRow();
                } else if (final === "C") {
                    col = Math.min(cols - 1, col + (n || 1));
                } else if (final === "D") {
                    col = Math.max(0, col - (n || 1));
                } else if (final === "G") {
                    col = Math.max(0, (n || 1) - 1);
                } else if (final === "H" || final === "f") {
                    row = (nums[0] || 1) - 1;
                    col = (nums[1] || 1) - 1;
                    clampRow();
                    if (col < 0) col = 0;
                } else if (final === "J") {
                    const mode = n || 0;
                    if (mode === 0 || mode === 2) {
                        for (let r = row; r < rows; r += 1) {
                            for (let c = r === row ? col : 0; c < cols; c += 1) grid[r][c] = " ";
                        }
                    }
                    if (mode === 1 || mode === 2) {
                        for (let r = 0; r <= row; r += 1) {
                            for (let c = 0; c < (r === row ? col + 1 : cols); c += 1) grid[r][c] = " ";
                        }
                    }
                } else if (final === "K") {
                    const mode = n || 0;
                    if (mode === 0) {
                        for (let c = col; c < cols; c += 1) grid[row][c] = " ";
                    } else if (mode === 1) {
                        for (let c = 0; c <= col; c += 1) grid[row][c] = " ";
                    } else {
                        for (let c = 0; c < cols; c += 1) grid[row][c] = " ";
                    }
                }
            }
            i = j + 1;
            continue;
        }
        if (ch === "\x1b") {
            i += 1;
            continue;
        }
        if (ch === "\r") {
            col = 0;
            i += 1;
            continue;
        }
        if (ch === "\n") {
            row += 1;
            clampRow();
            i += 1;
            continue;
        }
        if (ch === "\b") {
            if (col > 0) col -= 1;
            i += 1;
            continue;
        }
        if (ch === "\t") {
            col = Math.min(cols - 1, (Math.floor(col / 8) + 1) * 8);
            i += 1;
            continue;
        }
        if (ch < " ") {
            i += 1;
            continue;
        }
        if (col >= cols) {
            col = 0;
            row += 1;
            clampRow();
        }
        grid[row][col] = ch;
        col += 1;
        i += 1;
    }

    return grid.map((line) => line.join("").replace(/\s+$/, ""));
}
