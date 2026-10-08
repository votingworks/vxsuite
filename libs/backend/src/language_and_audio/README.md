# Language and Audio

## Google Cloud Authentication

We've created a
[Google Cloud service account](https://cloud.google.com/iam/docs/service-account-overview)
for VxHub that has access to the Google Cloud Translation and Text-to-Speech
APIs. VxHub will be deployed with the `vxdesign` service account key.

For local development, VotingWorks employees can impersonate the `vxdesign`
service account. To do this, you'll need to
[install the Google Cloud CLI](https://cloud.google.com/sdk/docs/install-sdk)
and run the following command:

```sh
gcloud auth application-default login --impersonate-service-account vxdesign@astral-pursuit-395520.iam.gserviceaccount.com
```
