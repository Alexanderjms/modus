"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Worker, MessageChannel, receiveMessageOnPort } = require("node:worker_threads");

const WAIT_TIMEOUT_MS = 90000;

function workerPath() {
  const root = fs.existsSync(path.join(process.cwd(), "db", "cloud", "turso-worker.cjs"))
    ? process.cwd()
    : path.resolve(__dirname, "../..");
  return path.join(root, "db", "cloud", "turso-worker.cjs");
}

function getWorker() {
  const holder = (globalThis.__modusTursoWorker ??= {});
  if (holder.worker) return holder;
  const { port1, port2 } = new MessageChannel();
  const sab = new SharedArrayBuffer(4);
  const worker = new Worker(workerPath(), { workerData: { port: port2, sab }, transferList: [port2] });
  worker.unref();
  port1.unref();
  worker.on("exit", () => {
    if (holder.worker === worker) holder.worker = null;
  });
  holder.worker = worker;
  holder.port = port1;
  holder.flag = new Int32Array(sab);
  return holder;
}

function call(message) {
  const holder = getWorker();
  while (receiveMessageOnPort(holder.port)) {}
  Atomics.store(holder.flag, 0, 0);
  holder.port.postMessage(message);
  if (Atomics.wait(holder.flag, 0, 0, WAIT_TIMEOUT_MS) === "timed-out") {
    throw new Error("Turso no respondió a tiempo.");
  }
  const received = receiveMessageOnPort(holder.port);
  if (!received) throw new Error("Turso no devolvió respuesta.");
  const { result, error } = received.message;
  if (error) {
    const failure = new Error(error.message);
    if (error.code) failure.code = error.code;
    throw failure;
  }
  return result;
}

function normalizeArgs(args) {
  const list = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  if (list.some((value) => value && typeof value === "object" && !(value instanceof Uint8Array))) {
    throw new TypeError("Turso solo admite parámetros posicionales.");
  }
  return list;
}

function fixRow(row) {
  for (const key of Object.keys(row)) {
    if (row[key] instanceof Uint8Array && !Buffer.isBuffer(row[key])) row[key] = Buffer.from(row[key]);
  }
  return row;
}

class TursoStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
  }

  execute(args) {
    return this.database.run(this.sql, normalizeArgs(args));
  }

  get(...args) {
    const [first] = this.execute(args).rows;
    return first ? fixRow(first) : undefined;
  }

  all(...args) {
    return this.execute(args).rows.map(fixRow);
  }

  run(...args) {
    const { changes, lastInsertRowid } = this.execute(args);
    return { changes, lastInsertRowid };
  }
}

class TursoDatabase {
  constructor(config) {
    this.kind = "turso";
    this.inTx = false;
    this.id = call({ op: "open", config }).id;
    this.open = true;
  }

  get isTransaction() {
    return this.inTx;
  }

  get isOpen() {
    return this.open;
  }

  run(sql, args) {
    if (!this.open) throw new Error("La base de datos está cerrada.");
    const result = call({ op: "execute", id: this.id, sql, args });
    this.inTx = result.inTx;
    return result;
  }

  prepare(sql) {
    return new TursoStatement(this, sql);
  }

  setForeignKeys(enabled) {
    call({ op: "fk", id: this.id, enabled });
    this.inTx = false;
  }

  exec(sql) {
    if (!this.open) throw new Error("La base de datos está cerrada.");
    const result = call({ op: "sequence", id: this.id, sql });
    this.inTx = result.inTx;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    try {
      call({ op: "close", id: this.id });
    } catch {}
  }
}

function openTurso(config) {
  return new TursoDatabase(config);
}

module.exports = { openTurso, TursoDatabase };
