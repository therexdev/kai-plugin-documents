"use strict";
const path = require("node:path");
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
// All reads and writes are implemented by the guarded Documents service.
// This helper owns only validated document filenames inside plugin data.
class DocStore {
  constructor(dir) { this.dir = dir; }
  _file(id) { if (typeof id !== "string" || !ID_RE.test(id)) throw Error("bad doc id"); return path.join(this.dir, `${id}.json`); }
}
module.exports = { DocStore };
