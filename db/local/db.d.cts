import type { DatabaseSync } from "node:sqlite";

export function getProjectRoot(): string;
export function getDefaultDbPath(): string;
export function getSchemaPath(): string;
export function getDatabase(customPath?: string): DatabaseSync;
