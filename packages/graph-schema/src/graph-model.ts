import { z } from 'zod';

/**
 * The versioned Business Execution Graph schema — see
 * docs/architecture/graph-model.md and docs/architecture/domain-model.md.
 * Framework-independent: nothing here knows about Spring or Java.
 *
 * `packages/graph-schema` owns only the *shape*, not the full
 * `flowscope.json` multi-graph document wrapper described in
 * docs/architecture/graph-model.md — that lands when disk
 * persistence/caching is actually implemented (docs/sprints/SPRINT-5.md's
 * "Explicitly deferred"). What's here is exactly what crosses IPC today:
 * one graph per discovered API.
 */

export const BEG_NODE_TYPES = [
  'business-step',
  'decision',
  'validation',
  'database-operation',
  'external-service',
  'message-publish',
  'message-consume',
  'transformation',
  'authentication',
  'authorization',
  'transaction',
  'response',
  'error',
  'system-boundary',
] as const;
export const BegNodeTypeSchema = z.enum(BEG_NODE_TYPES);
export type BegNodeType = z.infer<typeof BegNodeTypeSchema>;

export const BEG_EDGE_TYPES = [
  'sequence',
  'conditional',
  'success',
  'error',
  'loop',
  'parallel',
  'dependency',
  'external-call',
] as const;
export const BegEdgeTypeSchema = z.enum(BEG_EDGE_TYPES);
export type BegEdgeType = z.infer<typeof BegEdgeTypeSchema>;

export const BegSourceLocationSchema = z.object({
  file: z.string().min(1),
  lineStart: z.number().int().nonnegative(),
  lineEnd: z.number().int().nonnegative(),
  method: z.string().min(1).optional(),
  className: z.string().min(1).optional(),
});
export type BegSourceLocation = z.infer<typeof BegSourceLocationSchema>;

export const BegNodeSchema = z.object({
  id: z.string().min(1),
  type: BegNodeTypeSchema,
  businessName: z.string().min(1),
  businessDescription: z.string().min(1),
  /** Business inference is never presented as certain (MASTER_PLAN.md §12) — always in [0, 1]. */
  confidence: z.number().min(0).max(1),
  technicalName: z.string().min(1),
  source: BegSourceLocationSchema.optional(),
});
export type BegNode = z.infer<typeof BegNodeSchema>;

export const BegEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  type: BegEdgeTypeSchema,
  label: z.string().min(1).optional(),
});
export type BegEdge = z.infer<typeof BegEdgeSchema>;

/**
 * One business flow — everything inferred for a single discovered API.
 * `superRefine` enforces the structural contract
 * docs/architecture/graph-model.md assigns to `GraphValidator`: unique
 * node ids and no edge referencing a missing node. (Confidence range and
 * required fields are enforced by the field schemas above already.)
 */
export const BegGraphSchema = z
  .object({
    id: z.string().min(1),
    apiId: z.string().min(1),
    nodes: z.array(BegNodeSchema),
    edges: z.array(BegEdgeSchema),
  })
  .superRefine((graph, ctx) => {
    const nodeIds = new Set<string>();
    graph.nodes.forEach((node, index) => {
      if (nodeIds.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate node id "${node.id}".`,
          path: ['nodes', index, 'id'],
        });
      }
      nodeIds.add(node.id);
    });

    graph.edges.forEach((edge, index) => {
      if (!nodeIds.has(edge.from)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge "${edge.id}" references a missing node "${edge.from}".`,
          path: ['edges', index, 'from'],
        });
      }
      if (!nodeIds.has(edge.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge "${edge.id}" references a missing node "${edge.to}".`,
          path: ['edges', index, 'to'],
        });
      }
    });
  });
export type BegGraph = z.infer<typeof BegGraphSchema>;
