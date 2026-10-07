"use strict";

const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const TIMEOUT_MS = 10000;
const MAX_STDOUT_BYTES = 64 * 1024;

function isDpapiAvailable() {
  return process.platform === "win32";
}

function resolvePowerShellBinary() {
  const systemRoot = process.env.SystemRoot || process.env.windir || "C:\\Windows";
  const standardPath = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (fs.existsSync(standardPath)) {
    return standardPath;
  }
  return "powershell.exe";
}

function runPowerShellScript(script, inputData) {
  return new Promise((resolve, reject) => {
    if (!isDpapiAvailable()) {
      const err = new Error("Windows DPAPI solo está disponible en win32");
      err.code = "ERR_UNSUPPORTED_PLATFORM";
      return reject(err);
    }

    const psExe = resolvePowerShellBinary();
    const ps = spawn(psExe, ["-NoProfile", "-NonInteractive", "-Command", script], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let settled = false;
    const stdoutChunks = [];
    let stdoutBytes = 0;
    let timedOut = false;
    let overflow = false;

    function finishReject(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ps.kill();
      } catch {}
      reject(err);
    }

    function finishResolve(val) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(val);
    }

    const timer = setTimeout(() => {
      timedOut = true;
      const err = new Error("Timeout ejecutando operación DPAPI");
      err.code = "ETIMEDOUT";
      finishReject(err);
    }, TIMEOUT_MS);

    ps.stdin.on("error", (err) => {
      const wrapped = new Error("Error en canal de entrada seguro");
      wrapped.code = "EPIPE";
      wrapped.cause = err;
      finishReject(wrapped);
    });

    ps.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        overflow = true;
        try {
          ps.kill();
        } catch {}
        return;
      }
      stdoutChunks.push(chunk);
    });

    ps.stderr.resume();

    ps.on("error", (err) => {
      finishReject(err);
    });

    ps.on("close", (code) => {
      if (timedOut) return;
      if (overflow) {
        const err = new Error("Salida DPAPI excedió el tamaño permitido");
        err.code = "EOVERFLOW";
        return finishReject(err);
      }
      if (code !== 0) {
        const err = new Error("Operación de protección DPAPI falló");
        err.code = "ERR_DPAPI_FAILED";
        return finishReject(err);
      }
      finishResolve(Buffer.concat(stdoutChunks).toString("utf8"));
    });

    try {
      ps.stdin.end(Buffer.from(inputData, "utf8"));
    } catch (writeErr) {
      finishReject(writeErr);
    }
  });
}

const ENCRYPT_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "[Console]::InputEncoding = [System.Text.Encoding]::UTF8",
  "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
  "Add-Type -AssemblyName System.Security",
  "$raw = [Console]::In.ReadToEnd()",
  "if ($raw -eq $null -or $raw.Length -eq 0) { exit 1 }",
  "$bytes = [System.Text.Encoding]::UTF8.GetBytes($raw)",
  "$enc = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Console]::Out.Write([Convert]::ToBase64String($enc))",
].join("; ");

const DECRYPT_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "[Console]::InputEncoding = [System.Text.Encoding]::UTF8",
  "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
  "Add-Type -AssemblyName System.Security",
  "$raw = [Console]::In.ReadToEnd()",
  "if ($raw -eq $null) { exit 1 }",
  "$b64 = $raw.Trim()",
  "if ($b64.Length -eq 0) { exit 1 }",
  "$bytes = [Convert]::FromBase64String($b64)",
  "$dec = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($dec))",
].join("; ");

async function encryptWithDpapi(plainSecret) {
  if (typeof plainSecret !== "string" || plainSecret.length === 0) {
    throw new TypeError("El secreto debe ser una cadena no vacía");
  }
  const result = await runPowerShellScript(ENCRYPT_SCRIPT, plainSecret);
  const trimmed = result.trim();
  if (!trimmed) {
    throw new Error("Salida cifrada DPAPI vacía");
  }
  return trimmed;
}

async function decryptWithDpapi(encryptedSecret) {
  if (typeof encryptedSecret !== "string" || encryptedSecret.length === 0) {
    throw new TypeError("La clave cifrada debe ser una cadena Base64 no vacía");
  }
  const result = await runPowerShellScript(DECRYPT_SCRIPT, encryptedSecret);
  if (result.length === 0) {
    throw new Error("Resultado de descifrado vacío");
  }
  return result;
}

function decryptWithDpapiSync(encryptedSecret) {
  if (typeof encryptedSecret !== "string" || encryptedSecret.length === 0) {
    throw new TypeError("La clave cifrada debe ser una cadena Base64 no vacía");
  }
  const result = spawnSync(resolvePowerShellBinary(), ["-NoProfile", "-NonInteractive", "-Command", DECRYPT_SCRIPT], {
    input: encryptedSecret,
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    windowsHide: true,
  });
  if (result.status !== 0 || !result.stdout) {
    const err = new Error("Operación de protección DPAPI falló");
    err.code = "ERR_DPAPI_FAILED";
    throw err;
  }
  return result.stdout;
}

module.exports = {
  isDpapiAvailable,
  decryptWithDpapiSync,
  resolvePowerShellBinary,
  encryptWithDpapi,
  decryptWithDpapi,
};
