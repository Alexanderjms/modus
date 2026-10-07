"use strict";

const zlib = require("node:zlib");

const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_CHARS = 60000;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    if (entity[0] !== "#") return ENTITIES[entity.toLowerCase()];
    const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
  });
}

function openZip(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Archivo ZIP inválido.");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Directorio ZIP inválido.");
    const method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    entries.set(name, { method, compressed, local });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return {
    has: (name) => entries.has(name),
    names: () => [...entries.keys()],
    read(name) {
      const entry = entries.get(name);
      if (!entry) return null;
      if (buffer.readUInt32LE(entry.local) !== 0x04034b50) throw new Error("Entrada ZIP inválida.");
      const start = entry.local + 30 + buffer.readUInt16LE(entry.local + 26) + buffer.readUInt16LE(entry.local + 28);
      const data = buffer.subarray(start, start + entry.compressed);
      if (entry.method === 0) return data.length <= MAX_ENTRY_BYTES ? data.toString("utf8") : null;
      if (entry.method !== 8) throw new Error("Compresión ZIP no soportada.");
      return zlib.inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES }).toString("utf8");
    },
  };
}

function textOf(xml) {
  let out = "";
  for (const match of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += decodeXml(match[1]);
  return out;
}

function columnIndex(ref) {
  let index = 0;
  for (const char of ref.replace(/[^A-Z]/gi, "").toUpperCase()) index = index * 26 + char.charCodeAt(0) - 64;
  return Math.max(0, index - 1);
}

function csvCell(value) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function xlsxToText(buffer) {
  const zip = openZip(buffer);
  const workbook = zip.read("xl/workbook.xml");
  if (!workbook) throw new Error("No es un libro de Excel válido.");
  const rels = new Map();
  for (const match of (zip.read("xl/_rels/workbook.xml.rels") || "").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]*)"/.exec(match[0])?.[1];
    const target = /\bTarget="([^"]*)"/.exec(match[0])?.[1];
    if (id && target) rels.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }
  const shared = [];
  for (const match of (zip.read("xl/sharedStrings.xml") || "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(textOf(match[1]));

  const parts = [];
  let length = 0;
  for (const sheet of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = decodeXml(/\bname="([^"]*)"/.exec(sheet[0])?.[1] ?? "Hoja");
    const path = rels.get(/\br:id="([^"]*)"/.exec(sheet[0])?.[1] ?? "");
    const xml = path ? zip.read(path) : null;
    if (!xml) continue;
    const rows = [`## Hoja: ${name}`];
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const type = /\bt="([^"]*)"/.exec(cell[1])?.[1];
        const ref = /\br="([^"]*)"/.exec(cell[1])?.[1];
        const body = cell[2] ?? "";
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let value = "";
        if (type === "s" && raw !== undefined) value = shared[Number(raw)] ?? "";
        else if (type === "inlineStr") value = textOf(body);
        else if (type === "b") value = raw === "1" ? "VERDADERO" : "FALSO";
        else if (raw !== undefined) value = decodeXml(raw);
        cells[ref ? columnIndex(ref) : cells.length] = value;
      }
      if (!cells.some((value) => value)) continue;
      const line = Array.from(cells, (value) => csvCell(value ?? "")).join(",");
      rows.push(line);
      length += line.length + 1;
      if (length > MAX_OUTPUT_CHARS) break;
    }
    parts.push(rows.join("\n"));
    if (length > MAX_OUTPUT_CHARS) break;
  }
  if (!parts.length) throw new Error("El libro no tiene hojas legibles.");
  return parts.join("\n\n");
}

function docxToText(buffer) {
  const xml = openZip(buffer).read("word/document.xml");
  if (!xml) throw new Error("No es un documento de Word válido.");
  let out = "";
  for (const match of xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:(?:br|cr)\b[^>]*\/>|<\/w:tc>|<\/w:tr>|<\/w:p>/g)) {
    if (match[1] !== undefined) out += decodeXml(match[1]);
    else out += match[0].startsWith("<w:tab") || match[0] === "</w:tc>" ? "\t" : "\n";
    if (out.length > MAX_OUTPUT_CHARS) break;
  }
  return out.replace(/\n\t/g, "\t").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_OUTPUT_CHARS);
}

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function isOfficeType(type) {
  return type === XLSX_TYPE || type === DOCX_TYPE;
}

function extractOfficeText(type, buffer) {
  return type === XLSX_TYPE ? xlsxToText(buffer) : docxToText(buffer);
}

module.exports = { XLSX_TYPE, DOCX_TYPE, isOfficeType, extractOfficeText };
