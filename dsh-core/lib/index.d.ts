/** dsh-core shared utilities type declarations. */

export function hashString(input: string): string

export function dedupeBy<T>(items: T[], keyFn: (item: T) => string): T[]

export function mergeConfig(base: unknown, patch: unknown): unknown

export function sanitizeSettings(settings: unknown, secretKeys?: string[]): unknown
