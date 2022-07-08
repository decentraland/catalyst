import type { IFetchComponent } from '@well-known-components/http-server'
import type {
  IConfigComponent,
  ILoggerComponent,
  IHttpServerComponent
  // IBaseComponent,
  // IMetricsComponent
} from '@well-known-components/interfaces'
import { Environment } from './Environment'
// import { metricDeclarations } from './metrics2'

export type GlobalContext = {
  components: BaseComponents
}

// components used in every environment
export type BaseComponents = {
  config: IConfigComponent
  logs: ILoggerComponent
  // server: IHttpServerComponent<GlobalContext>
  // fetch: IFetchComponent
  // metrics: IMetricsComponent<keyof typeof metricDeclarations>
  env: Environment
}

// components used in runtime
export type AppComponents = BaseComponents & {
  // statusChecks: IBaseComponent
}

// components used in tests
export type TestComponents = BaseComponents & {
  // A fetch component that only hits the test server
  localFetch: IFetchComponent
}

// this type simplifies the typings of http handlers
export type HandlerContextWithPath<
  ComponentNames extends keyof AppComponents,
  Path extends string = any
> = IHttpServerComponent.PathAwareContext<
  IHttpServerComponent.DefaultContext<{
    components: Pick<AppComponents, ComponentNames>
  }>,
  Path
>

export type Context<Path extends string = any> = IHttpServerComponent.PathAwareContext<GlobalContext, Path>
