// Production entry point under IIS + iisnode (deploy/web.config). iisnode hands us a named pipe
// in process.env.PORT and terminates HTTPS itself, so tell Next.js the original scheme.
const { createServer } = require("http");
const next = require("next");

const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    if (req.headers["x-iisnode-https"] === "on") req.headers["x-forwarded-proto"] = "https";
    handle(req, res);
  }).listen(process.env.PORT || 3100);
});
