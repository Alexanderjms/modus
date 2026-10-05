"use strict";

const crypto = require("node:crypto");

const SCRYPT = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const SALT_BYTES = 16;
const KEY_BYTES = 64;

function formatScryptHash(salt, hash) {
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function hashPassword(password) {
  if (typeof password !== "string" || password.length === 0) {
    throw new TypeError("La contraseña debe ser una cadena no vacía.");
  }
  const salt = crypto.randomBytes(SALT_BYTES);
  const hash = crypto.scryptSync(password, salt, KEY_BYTES, SCRYPT);
  return formatScryptHash(salt, hash);
}

function hashPasswordAsync(password) {
  if (typeof password !== "string" || password.length === 0) {
    return Promise.reject(new TypeError("La contraseña debe ser una cadena no vacía."));
  }
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_BYTES);
    crypto.scrypt(password, salt, KEY_BYTES, SCRYPT, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(formatScryptHash(salt, derivedKey));
    });
  });
}

function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltHex, hashHex] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (N !== SCRYPT.N || r !== SCRYPT.r || p !== SCRYPT.p) return false;
  if (!/^[0-9a-f]{32}$/i.test(saltHex) || !/^[0-9a-f]{128}$/i.test(hashHex)) return false;

  const expected = Buffer.from(hashHex, "hex");
  const salt = Buffer.from(saltHex, "hex");
  if (expected.length === 0 || salt.length === 0) return false;

  const actual = crypto.scryptSync(password, salt, KEY_BYTES, SCRYPT);
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = {
  hashPassword,
  hashPasswordAsync,
  verifyPassword,
  HASH_PREFIX: "scrypt$",
};
