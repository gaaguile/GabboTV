import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const intervalMs = Number(process.env.UPDATE_INTERVAL_MS) || 5 * 60 * 1000;
const indexPath = join(dirname(fileURLToPath(import.meta.url)), "index.js");

function runUpdate(): void {
    const child = spawn(process.execPath, [indexPath], { stdio: "inherit" });
    child.on("error", (error) => console.error("[scheduler] Failed to start update:", error));
    child.on("exit", (code, signal) => {
        if (code !== 0) console.error(`[scheduler] Update exited with code=${code ?? "unknown"} signal=${signal ?? "none"}`);
    });
}

runUpdate();
setInterval(runUpdate, intervalMs);
console.log(`[scheduler] Running updates every ${intervalMs / 60000} minutes`);
