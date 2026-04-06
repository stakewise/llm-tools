import type { AnyAgentTool, OpenClawPluginApi, OpenClawPluginCommandDefinition } from 'openclaw/plugin-sdk/plugin-entry'


export type ExecuteResult = ReturnType<AnyAgentTool['execute']>

export type CommandResult = ReturnType<OpenClawPluginCommandDefinition['handler']>

export type ExtendedApi = OpenClawPluginApi & {
  tools: ExtendedTools
};

export namespace Methods {

  type GetBalanceInput = {
    address: string
    network: string
  }

  type GetBalance = (params: GetBalanceInput) => ExecuteResult
}
