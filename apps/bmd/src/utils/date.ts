import moment from 'moment'

// eslint-disable-next-line import/prefer-default-export
export const dateLong = (dateString: string) =>
  moment(new Date(dateString)).format('LL')

export const weekdayAndDate = (dateString: string) =>
  moment(new Date(dateString)).format('dddd, MMMM D, YYYY')

export const twelveHourTime = (dateString: string) =>
  moment(new Date(dateString)).format('LT')

export const inputDate = (date: Date) => moment(date).format('YYYY-MM-DD')
export const inputTime = (date: Date) => moment(date).format('HH:mm')
