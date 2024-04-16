# Background
VotingWorks makes voting machines. All of the software we write is open-source. The security of voting machines is of the utmost importance.
At the same time, the process for addressing vulnerabilities and deploying fixes in the field is particularly complex, due to regulatory oversight of voting systems.

With this vulnerability disclosure policy, we aim to:
- Make it easy and safe to report a vulnerability to us
- Protect election jurisdictions with voting systems affected by the vulnerability, by ensuring that vulnerabilities are addressed before they become public
- Release information as soon as possible about vulnerabilities and how they have been addressed to the public.

# Reporting a Vulnerability
Please report vulnerabilities using [the GitHub form](https://github.com/votingworks/vxsuite/security/advisories/new).
Please submit a separate instance of the form for each vulnerability you wish to report.
Please keep vulnerabilities you discover confidential while we work with you to resolve these vulnerabilities.

# Vulnerability Information
All vulnerabilities that have been addressed in VotingWorks voting machines that are expected to be in use in real elections are promptly posted on our [vulnerability disclosure page](https://github.com/votingworks/vxsuite/security/advisories).

# Vulnerability Handling
We handle vulnerabilities using the following Coordinated Vulnerability Disclosure process:
- The reporter reports the vulnerability privately to VotingWorks.
- VotingWorks works privately with the reporter to understand the vulnerability, with an initial response within 10 business days of receipt of the report.
- VotingWorks prepares fixes as needed for reported vulnerabilities. Some fixes will be operational, others in software, and others potentially in hardware. Where the issues affect a third-party component, VotingWorks will do its best to coordinate advisories and disclosures with other involved parties.
- When fixes require certification by the appropriate agencies, notably the Election Assistance Commission, VotingWorks works with these agencies to certify the fixes.
- VotingWorks privately works with affected jurisdictions to deploy mitigations and fixes.
- VotingWorks assigns a CVE for the vulnerability and publishes the vulnerability on the disclosure page, giving credit to the reporter if they choose to take credit. VotingWorks reserves the assignment of a CVE to confirmed security issues on products that have not been end-of-life’d.
