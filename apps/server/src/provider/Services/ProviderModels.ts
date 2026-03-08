import type { ProviderGetModelsResult, ProviderKind } from "@t3tools/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

export interface ProviderModelsShape {
  readonly getModels: (provider: ProviderKind) => Effect.Effect<ProviderGetModelsResult>;
}

export class ProviderModels extends ServiceMap.Service<ProviderModels, ProviderModelsShape>()(
  "osscode/provider/Services/ProviderModels",
) {}
