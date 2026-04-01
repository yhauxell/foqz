import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const dir = path.join(root, "dist-landing")
const src = path.join(dir, "landing.html")
const dst = path.join(dir, "index.html")

if (!fs.existsSync(src)) {
  console.error("landing-copy-index: missing", src)
  process.exit(1)
}
fs.copyFileSync(src, dst)
