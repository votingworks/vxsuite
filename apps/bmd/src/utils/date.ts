import moment from 'moment'

// eslint-disable-next-line import/prefer-default-export
export const dateLong = (dateString: string) =>
  moment(new Date(dateString)).format('LL')
