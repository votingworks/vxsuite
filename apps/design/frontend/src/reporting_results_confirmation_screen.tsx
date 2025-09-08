import { getResultsReportConfirmationDetails } from './api';

export function ReportingResultsConfirmationScreen(): JSX.Element | null {
  const getResultsReportConfirmationDetailsQuery =
    getResultsReportConfirmationDetails.useQuery();
  const resultsDetails = getResultsReportConfirmationDetailsQuery.data;
  if (!resultsDetails) {
    return <div>Invalid Request</div>;
  }
  console.log(resultsDetails);

  return <div>Thank you for reporting your election results!</div>;
}
