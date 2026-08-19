/**
 * Member subagent lifecycle: spawn a continuable child per member, deliver
 * messages into its FIFO inbox, and observe its activity.
 *
 * Members are durable continuable subagents of the captain, so a member keeps
 * its conversation across turns and across harness restarts: the captain
 * wakes it with {@link ctx.subagents.followup}, it works through its turn
 * (updating team state through the `agent_teams_*` tools), and becomes idle
 * again. Its final assistant message is not readable programmatically, so the
 * member persists its report into the captain's mailbox and the task records,
 * which the captain reads through `agent_teams_status`.
 * @module dsh-work/members
 */
import { installModelSelection } from '@deepseek-ai/dsh-agent';
// Declaration merge only: makes ctx.subagents visible.
import { delegationDepthOf, foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent';
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { join } from 'node:path';
import { readTeamSync } from "./state.js";
/** Captain-only AgentTeams tools hidden from newly spawned members. */
const MEMBER_DENIED_TOOLS = [
    'agent_teams_create',
    'agent_teams_add_member',
    'agent_teams_remove_member',
    'agent_teams_create_task',
    'agent_teams_delete',
];
/**
 * Restore the SessionId brand on a value that round-tripped through the
 * durable team file. The brand is erased by JSON serialization; the value
 * originated from `startContinuable`/`agent.id`, so this cast is the boundary
 * restoration, not a new assertion.
 */
function brandedSessionId(value) {
    return value;
}
/**
 * Resolve one member's complete model selection, mirroring what
 * `startContinuable`'s official route inheritance would choose. Ordinary
 * members snapshot the captain's current request route and reasoning effort;
 * an explicit member provider/model or plugin-level model replaces only that
 * route. The resolved provider/model feeds the official `agentOptions`
 * (persisted + cold-restored by the descriptor); the effort travels through
 * the small pending bridge because `AgentOptions` has no effort field.
 */
export async function resolveMemberLlmSelection(ctx, captain, request, signal) {
    const explicitProvider = request.provider?.trim();
    const explicitModel = request.model?.trim();
    const defaultModel = request.defaultModel?.trim();
    if (request.provider !== undefined && explicitProvider === '') {
        throw new Error('member LLM provider must not be empty');
    }
    if (request.model !== undefined && explicitModel === '') {
        throw new Error('member model must not be empty');
    }
    if (request.defaultModel !== undefined && defaultModel === '') {
        throw new Error('configured memberModel must not be empty');
    }
    if (explicitProvider !== undefined && explicitModel === undefined) {
        throw new Error('an explicit member LLM provider requires an explicit member model');
    }
    const current = captain.session.requestHeader()?.config;
    const provider = explicitProvider ?? current?.provider ?? captain.options.provider;
    const model = explicitModel ?? defaultModel ?? current?.model ?? captain.options.model;
    if (provider === undefined || model === undefined) {
        throw new Error('cannot resolve the member LLM route from the current captain session');
    }
    const resolved = await ctx.llm.resolveCallConfig({
        provider,
        model,
        ...current?.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: current.reasoningEffort },
    }, signal);
    return {
        provider: resolved.provider,
        model: resolved.model,
        ...resolved.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: String(resolved.reasoningEffort) },
    };
}
const MEMBER_LABEL_PREFIX = 'agent-teams:';
function pendingSelectionKey(parentSessionId, label) {
    return `${parentSessionId}\u0000${label}`;
}
/**
 * Install the member selection bridge for every fresh or cold-resumed
 * continuable child.
 *
 * Provider/model are the official `startContinuable` descriptor's job
 * (snapshotted before any await, restored on cold resume), so this bridge
 * only fills the one slot the official route leaves open: reasoning effort,
 * which is absent from `AgentOptions` and not restored by the descriptor.
 * Fresh creation reads the pending in-memory effort; cold resume reads the
 * owning team's durable record.
 */
export function installMemberSelectionRuntime(ctx, stateDir) {
    const pending = new Map();
    ctx.subagents.registerContinuableSetup((childCtx) => {
        const child = childCtx.agent;
        if (child === undefined)
            return () => undefined;
        const suffix = child.session.events.slice(child.session.header.seedLength ?? 0);
        const descriptor = foldSubagentDescriptor(suffix);
        if (descriptor?.mode !== 'continuable' || !descriptor.label.startsWith(MEMBER_LABEL_PREFIX)) {
            return () => undefined;
        }
        const parentSessionId = child.session.header.parentSession;
        if (parentSessionId === undefined)
            return () => undefined;
        const key = pendingSelectionKey(parentSessionId, descriptor.label);
        let reasoningEffort = pending.get(key);
        if (reasoningEffort === undefined) {
            const identity = descriptor.label.slice(MEMBER_LABEL_PREFIX.length);
            const separator = identity.indexOf(':');
            if (separator < 1 || separator === identity.length - 1)
                return () => undefined;
            const teamId = identity.slice(0, separator);
            const memberName = identity.slice(separator + 1);
            const workspace = child.session.header.cwd ?? process.cwd();
            const team = readTeamSync(join(workspace, stateDir), teamId);
            if (team?.captainSessionId !== parentSessionId)
                return () => undefined;
            const member = team.members.find(candidate => candidate.name === memberName);
            reasoningEffort = member?.reasoningEffort?.trim() || undefined;
            // Provider/model come from the durable descriptor (official path); an
            // old team record without an effort simply keeps the adapter default.
            if (reasoningEffort === undefined)
                return () => undefined;
        }
        // Install the effort through the official per-agent selection waterfall.
        // The provider/model pair comes from the durable descriptor (the same
        // source the official resume path uses — `descriptor.agentProvider` /
        // `descriptor.agentModel`), so we never re-state a route the official
        // mechanism already owns, and we do not depend on `child.options` being
        // populated at this setup point.
        const provider = descriptor.agentProvider ?? child.options.provider;
        const model = descriptor.agentModel ?? child.options.model;
        if (provider === undefined || model === undefined)
            return () => undefined;
        return installModelSelection(childCtx, {
            current: {
                provider,
                model,
                reasoningEffort: ReasoningEffortId(reasoningEffort),
            },
            assembled: undefined,
        });
    });
    return {
        async withPendingEffort(parentSessionId, label, reasoningEffort, operation) {
            const key = pendingSelectionKey(parentSessionId, label);
            if (pending.has(key)) {
                throw new Error(`member reasoning effort is already pending for "${label}"`);
            }
            if (reasoningEffort !== undefined)
                pending.set(key, reasoningEffort);
            try {
                return await operation();
            }
            finally {
                pending.delete(key);
            }
        },
    };
}
/**
 * The member's system prompt (persona), shadowing the deployment persona for
 * that child. Self-contained: it replaces the whole persona section.
 * @param team - the team the member joined.
 * @param member - the member record (name/role are read before spawning).
 * @param stateDir - configured state directory, so the member can locate the
 *   team files with its own file tools.
 */
export function memberPersona(team, member, stateDir) {
    return `You are ${member.name}, a member of the multi-agent team "${team.name}" running inside DeepSeek Harness AgentTeams. The captain leads the team; you are a worker member${member.role ? ` with the role: ${member.role}` : ''}.

Team context:
- Team id: ${team.id}
- Your name inside the team (use it as \`from\`/identity): ${member.name}
- The team state lives under ${stateDir}/${team.id}/ (team.json and inbox/*.jsonl). You may inspect these files read-only for diagnostics, but never edit them directly; use the agent_teams_* tools so JSON escaping and concurrent updates stay safe.
- The captain and your teammates reach you through messages. Each message you receive is a new turn: act on it and end your turn with a concise reply.

Working rules:
1. When the captain assigns you a task, call agent_teams_claim_task with the task id to claim it, then agent_teams_update_task (status=in_progress) once you start working.
2. Work thoroughly with your available tools; do not cut corners.
3. When finished, call agent_teams_update_task with status=completed and a concise \`output\` summarizing what you did and the key results.
4. Send a short report to the captain with agent_teams_send_message (to=captain) when you complete a task or hit a blocker.
5. To ask a teammate something, use agent_teams_send_message with to=<teammate name>; the message lands in their mailbox and wakes them directly — teammates talk to each other without the captain in the loop. The same applies to the captain (to=captain).
6. You are a worker: do not create or delete teams, and do not add or remove members — that is the captain's job.`;
}
/**
 * The initial user message delivered when the member is created.
 * @param team - the team the member joined.
 */
export function memberWelcome(team) {
    return `You have joined the team "${team.name}" as a member. The captain will send you tasks and messages; wait for instructions. Current team status: ${team.tasks.length} task(s), none assigned to you yet.`;
}
/**
 * Spawn one member as a durable continuable subagent of the captain and fill
 * `member.id` with its child session id. On failure nothing is persisted.
 * @param ctx - the plugin context (injects `subagents`).
 * @param config - member runtime knobs.
 * @param selections - fresh/cold child model-selection bridge.
 * @param llmSelection - resolved provider/model/reasoning snapshot.
 * @param captain - the exact live captain agent (the calling agent).
 * @param team - the team record (read-only here).
 * @param member - the member draft whose `id` is filled on success.
 * @param stateDir - configured state directory (for the persona).
 * @param signal - caller cancellation, forwarded to the start.
 */
export async function spawnMember(ctx, config, selections, llmSelection, captain, team, member, stateDir, signal) {
    // Fail loud at the first use: provider registration is a sibling plugin's
    // effect and may settle after this plugin mounts. Capability checks here
    // mirror what startContinuable would reject, with an actionable error.
    const provider = ctx.subagents.getProvider(config.provider);
    if (provider === undefined) {
        throw new Error(`agent-teams: no subagent provider "${config.provider}" is registered (available: ${ctx.subagents.list().join(', ') || 'none'}) — `
            + 'check that the subagent provider row (e.g. subagent-spawn) is mounted in the composition');
    }
    if (provider.prepareContinuable === undefined) {
        throw new Error(`agent-teams: provider "${config.provider}" does not support continuable members`);
    }
    if (!provider.capabilities.persona) {
        throw new Error(`agent-teams: provider "${config.provider}" cannot apply a member persona`);
    }
    if (!provider.capabilities.toolFilter) {
        throw new Error(`agent-teams: provider "${config.provider}" cannot restrict captain-only tools for members`);
    }
    const label = `${MEMBER_LABEL_PREFIX}${team.id}:${member.name}`;
    // The official `startContinuable` `maxDepth` is an ABSOLUTE delegation-depth
    // cap (`resolveChildDepth` throws when `delegationDepthOf(parent) + 1 >
    // maxDepth`). Passing the bare `memberMaxDepth` (a per-member re-delegation
    // budget) there would reject every member of a non-root captain: a depth-1
    // captain spawns a depth-2 member, which exceeds cap 1. Compute the absolute
    // cap the member is allowed to reach instead: the member's own depth plus
    // its re-delegation budget.
    const memberMaxDepth = config.maxDepth === undefined
        ? undefined
        : delegationDepthOf(captain) + 1 + config.maxDepth;
    const start = await selections.withPendingEffort(captain.id, label, llmSelection.reasoningEffort, () => (ctx.subagents.startContinuable({
        provider: config.provider,
        label,
        request: {
            prompt: [{ type: 'text', text: memberWelcome(team) }],
            parent: captain,
            persona: memberPersona(team, member, stateDir),
            toolFilter: { deny: [...MEMBER_DENIED_TOOLS] },
            agentOptions: {
                provider: llmSelection.provider,
                model: llmSelection.model,
            },
            ...memberMaxDepth !== undefined ? { maxDepth: memberMaxDepth } : {},
        },
        signal,
    })));
    member.id = start.childId;
}
/**
 * Deliver one message to a member as its next FIFO turn. Best effort: a
 * failure (member gone or not continuable) is logged and reported as `false`
 * so the caller can decide (mailbox delivery still happened).
 *
 * Any team sender can route through this helper: the captain is the direct
 * parent of every member, and the caller passes the captain's live Agent
 * (its own when the captain calls, the registry-resolved one when a member
 * sends) — mirroring the Claude Code mailbox model where the writer writes
 * the target's inbox and the target picks it up on its own.
 * @param ctx - the plugin context (injects `subagents`).
 * @param captain - the exact live captain agent (the member's direct parent).
 * @param childId - the member's durable child session id.
 * @param text - the message content.
 * @param signal - caller cancellation, forwarded to the delivery.
 * @returns whether the member inbox accepted the message.
 */
export async function deliverToMember(ctx, captain, childId, text, signal) {
    try {
        await ctx.subagents.followup(captain, brandedSessionId(childId), [{ type: 'text', text }], {
            source: { kind: 'plugin', plugin: 'dsh-work' },
            signal,
        });
        return true;
    }
    catch (error) {
        ctx.logger.warn(`agent-teams: followup to member ${childId} failed: ${String(error)}`);
        return false;
    }
}
/**
 * Request cancellation of one live member's current turn. Best effort, fire
 * and return; the target may keep running until it observes the signal.
 * @param ctx - the plugin context (injects `subagents`).
 * @param captain - the exact live captain agent (the member's parent).
 * @param childId - the member's durable child session id.
 */
export function interruptMember(ctx, captain, childId) {
    try {
        ctx.subagents.interrupt(brandedSessionId(childId), { kind: 'ancestor', agent: captain });
    }
    catch (error) {
        ctx.logger.warn(`agent-teams: interrupt of member ${childId} failed: ${String(error)}`);
    }
}
/**
 * Snapshot each direct continuable child's activity under the captain's
 * session, keyed by child session id. A member that is currently running its
 * turn reports `running`; an idle member reports `inactive`.
 * @param ctx - the plugin context (injects `subagents`).
 * @param captainSessionId - the captain's session id.
 * @returns child id → activity, missing entries are unknown children.
 */
export async function memberActivity(ctx, captainSessionId) {
    const entries = await ctx.subagents.listChildren(brandedSessionId(captainSessionId));
    const activity = new Map();
    for (const entry of entries) {
        if (entry.kind === 'child')
            activity.set(entry.id, entry.activity);
    }
    return activity;
}
