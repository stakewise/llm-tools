const defaultDays = 30
const maxDays = 365

const parseDays = (value: string | null): number =>
  Math.min(Math.max(Number(value) || defaultDays, 1), maxDays)


export default parseDays
