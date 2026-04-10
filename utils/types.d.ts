import http from 'node:http'


export type RuntimeState = {
  host: string
  port: number
  address?: string
  server?: http.Server
  starting?: Promise<void>
}

export type ResponseInput = Record<string, any> & {
  code?: number
}

export type ResponseFn = (values: ResponseInput) => void
