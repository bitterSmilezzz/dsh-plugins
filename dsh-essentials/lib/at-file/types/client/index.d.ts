import { type ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** Required services: picker pipeline, session projection, carrier, Remote face, slots, and locale. */
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
