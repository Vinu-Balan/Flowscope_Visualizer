export {
  BUILD_SYSTEMS,
  BuildSystemSchema,
  ValidatedProjectSchema,
  PROJECT_VALIDATION_FAILURE_CODES,
  ProjectValidationFailureCodeSchema,
  ProjectValidationResultSchema,
} from './project';
export type {
  BuildSystem,
  ValidatedProject,
  ProjectValidationFailureCode,
  ProjectValidationResult,
} from './project';
export { validateProject } from './validate-project';
export type { ProjectValidationError } from './validate-project';
