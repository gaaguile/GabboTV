// Serves /template (the CasparCG HTML layer) and /data (snapshot.json etc.) over
// plain HTTP, since CasparCG's HTML producer needs a URL, not a file:// path.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEMPLATE_DIR = join(ROOT_DIR, "template");
const DATA_DIR = join(ROOT_DIR, "data");
const PORT = Number(process.env.PORT) || 8080;

const MIME_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
};

createServer(async (req, res) => {
    try {
        const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
        const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);

        const isDataRequest = pathname.startsWith("/data/");
        const baseDir = isDataRequest ? DATA_DIR : TEMPLATE_DIR;
        const relative = isDataRequest ? pathname.slice("/data/".length) : pathname.slice(1);
        const filePath = normalize(join(baseDir, relative));

        if (!filePath.startsWith(baseDir)) {
            res.writeHead(403).end("Forbidden");
            return;
        }

        const fileStat = await stat(filePath).catch(() => null);
        if (!fileStat?.isFile()) {
            res.writeHead(404).end("Not found");
            return;
        }

        const body = await readFile(filePath);
        res.writeHead(200, {
            "Content-Type": MIME_TYPES[extname(filePath)] ?? "application/octet-stream",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": isDataRequest ? "no-store" : "no-cache",
        });
        res.end(body);
    } catch (error) {
        console.error("[serve] Request failed:", error);
        res.writeHead(500).end("Internal error");
    }
}).listen(PORT, () => {
    console.log(`[serve] GabboTV template server running at http://localhost:${PORT}/`);
});
