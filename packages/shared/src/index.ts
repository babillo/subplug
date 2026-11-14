// Shared types and Zod validation schemas used by web and mobile live here.
export { brand, type Brand } from "./brand";
export {
  type CreateOrderRequest,
  normaliseNigerianPhone,
  type ParseResult,
  parseCreateOrderRequest,
} from "./orders";
export { formatNaira, nairaToKoboInput } from "./money";
export { guessNetwork, type NetworkId, NETWORKS } from "./networks";
export { isDataPlan, PLAN_GROUPS, type PlanGroup, planGroup, planSummary } from "./plans";
