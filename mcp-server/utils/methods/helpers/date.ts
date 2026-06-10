import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import duration from 'dayjs/plugin/duration'


export const initPlugins = () => {
  dayjs.extend(duration)
  dayjs.extend(utc)
}

initPlugins()


export default dayjs
