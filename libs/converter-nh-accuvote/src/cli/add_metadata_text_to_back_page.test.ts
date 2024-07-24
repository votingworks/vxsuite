import { parseMetadataFromPdfFileName } from './add_metadata_text_to_back_page';

test('parseMetadataFromPdfPath', () => {
  expect(
    parseMetadataFromPdfFileName(
      'precinct-ballot-Conway-Democratic-card-number-1-1823c592.pdf'
    )
  ).toEqual({
    townAndWard: 'Conway',
    party: 'Democratic',
  });
  expect(
    parseMetadataFromPdfFileName(
      'precinct-ballot-Rochester_Ward_1-Democratic-card-number-1-568d6a13.pdf'
    )
  ).toEqual({
    townAndWard: 'Rochester Ward 1',
    party: 'Democratic',
  });
  expect(
    parseMetadataFromPdfFileName(
      'precinct-ballot-New_Durham-Democratic-card-number-1-e36ef567.pdf'
    )
  ).toEqual({
    townAndWard: 'New Durham',
    ward: undefined,
    party: 'Democratic',
  });
  expect(
    parseMetadataFromPdfFileName(
      'precinct-ballot-Loudon-Republican-card-number-1-6d86be17.pdf'
    )
  ).toEqual({
    townAndWard: 'Loudon',
    party: 'Republican',
  });
});
