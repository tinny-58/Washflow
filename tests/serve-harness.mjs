import http from "http";
import fs from "fs";
import path from "path";

export function startHarnessServer(port = 3333) {
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://localhost:${port}`);
    const pathname = parsedUrl.pathname;

    if (pathname.startsWith("/images/")) {
      const imgPath = path.resolve("frontend/public" + pathname);
      if (fs.existsSync(imgPath)) {
        const ext = path.extname(imgPath);
        const mime = ext === ".webp" ? "image/webp" : ext === ".png" ? "image/png" : "image/jpeg";
        res.writeHead(200, { "Content-Type": mime });
        fs.createReadStream(imgPath).pipe(res);
        return;
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }
    }

    const filePath = path.resolve("tests/harness/index.html");
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error loading test harness: " + err.message);
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      resolve(server);
    });
    server.on("error", reject);
  });
}

if (process.argv[1] && process.argv[1].endsWith("serve-harness.mjs")) {
  startHarnessServer(3333).then(() => {
    console.log("Harness server running at http://localhost:3333");
  });
}
