export {
  BEG_EDGE_TYPES,
  BEG_NODE_TYPES,
  BegEdgeSchema,
  BegEdgeTypeSchema,
  BegGraphSchema,
  BegNodeSchema,
  BegNodeTypeSchema,
  BegSourceLocationSchema,
} from './graph-model';
export type {
  BegEdge,
  BegEdgeType,
  BegGraph,
  BegNode,
  BegNodeType,
  BegSourceLocation,
} from './graph-model';

export { isValidGraph, validateGraph } from './validate-graph';
export type { GraphValidationResult } from './validate-graph';
