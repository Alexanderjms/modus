"use strict";

const { hashPassword, hashPasswordAsync, verifyPassword, HASH_PREFIX } = require("../password.cjs");

function isValidPinFormat(pin) {
  return typeof pin === "string" && /^\d+$/.test(pin);
}

function hashPin(pin) {
  if (!isValidPinFormat(pin)) {
    throw new TypeError("El PIN debe ser una cadena no vacía compuesta solo por dígitos.");
  }
  return hashPassword(pin);
}

function hashPinAsync(pin) {
  if (!isValidPinFormat(pin)) {
    return Promise.reject(new TypeError("El PIN debe ser una cadena no vacía compuesta solo por dígitos."));
  }
  return hashPasswordAsync(pin);
}

function verifyPin(pin, storedHash) {
  if (!isValidPinFormat(pin) || typeof storedHash !== "string") {
    return false;
  }
  return verifyPassword(pin, storedHash);
}

module.exports = {
  isValidPinFormat,
  hashPin,
  hashPinAsync,
  verifyPin,
  HASH_PREFIX,
};
